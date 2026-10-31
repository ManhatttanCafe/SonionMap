import {
  Database,
  MapRecord,
  SonionNode,
  SonionEdge,
  SonionDocument,
  MapImage,
  NodeCreateInput,
  NodePatchInput,
  EdgeCreateInput,
  EdgePatchInput,
  DocumentCreateInput,
  DocumentPatchInput,
  ImageCreateInput,
  ExportPackage,
  MapSchema,
  ExportPackageSchema,
  DomainError,
  NODE_CATEGORIES,
  NODE_STATUSES,
  LayoutRequest,
} from './schema.js';
import { mutateDb, readDb, getDbPath, newId } from './store.js';
import {
  layoutNodes,
  layoutDocuments,
  NODE_WIDTH,
  NODE_HEIGHT,
  DOC_WIDTH,
  DOC_HEIGHT,
} from '../../src/utils/forceLayout.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return `http://${value}`;
  return value;
}

export function normalizeTags(tags: string[] | undefined): string[] {
  const normalized = (tags ?? [])
    .map(tag => tag.trim().toLowerCase().replace(/\s+/g, '-').replace(/^#+/, ''))
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 50);
}

export function deriveName(url: string): string {
  if (!url) return 'Unnamed node';
  try {
    const host = new URL(url).hostname;
    return host.replace(/\.onion$/i, '').slice(0, 40) || 'Unnamed node';
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0].slice(0, 40) || 'Unnamed node';
  }
}

export function findMap(db: Database, mapId: string): MapRecord {
  const map = db.maps.find(m => m.id === mapId);
  if (!map) {
    throw new DomainError('MAP_NOT_FOUND', `No map exists with id "${mapId}".`, 404);
  }
  return map;
}

function findNode(map: MapRecord, nodeId: string): SonionNode {
  const node = map.nodes.find(n => n.id === nodeId);
  if (!node) {
    throw new DomainError('NODE_NOT_FOUND', `No node exists with id "${nodeId}" in the map.`, 404);
  }
  return node;
}

function findEdge(map: MapRecord, edgeId: string): SonionEdge {
  const edge = map.edges.find(e => e.id === edgeId);
  if (!edge) {
    throw new DomainError('EDGE_NOT_FOUND', `No edge exists with id "${edgeId}" in the map.`, 404);
  }
  return edge;
}

function findDocument(map: MapRecord, documentId: string): SonionDocument {
  const document = map.documents.find(d => d.id === documentId);
  if (!document) {
    throw new DomainError(
      'DOCUMENT_NOT_FOUND',
      `No document exists with id "${documentId}" in the map.`,
      404
    );
  }
  return document;
}

function findImage(map: MapRecord, imageId: string): MapImage {
  const image = map.images.find(i => i.id === imageId);
  if (!image) {
    throw new DomainError('IMAGE_NOT_FOUND', `No image exists with id "${imageId}" in the map.`, 404);
  }
  return image;
}

function assertConnectableEntity(map: MapRecord, entityId: string): void {
  const exists =
    map.nodes.some(node => node.id === entityId) ||
    map.documents.some(document => document.id === entityId);
  if (!exists) {
    throw new DomainError(
      'ENTITY_NOT_FOUND',
      `No node or document exists with id "${entityId}" in the map.`,
      404
    );
  }
}

const IMAGE_REFERENCE_PATTERN = /sonion-image:([A-Za-z0-9._-]+)/g;

function cleanupUnusedImages(map: MapRecord): number {
  const used = new Set<string>();
  for (const document of map.documents) {
    for (const match of document.content.matchAll(IMAGE_REFERENCE_PATTERN)) {
      used.add(match[1]);
    }
  }
  const before = map.images.length;
  map.images = map.images.filter(image => used.has(image.id));
  return before - map.images.length;
}

function findDuplicateNode(map: MapRecord, url: string, name: string): SonionNode | undefined {
  if (url) {
    const target = url.toLowerCase();
    return map.nodes.find(n => n.url.toLowerCase() === target);
  }
  const targetName = name.toLowerCase();
  return map.nodes.find(n => n.name.toLowerCase() === targetName);
}

function defaultPosition(map: MapRecord): { x: number; y: number } {
  const margin = 24;
  const cellWidth = NODE_WIDTH + 70;
  const cellHeight = NODE_HEIGHT + 80;
  const columns = Math.max(3, Math.ceil(Math.sqrt(map.nodes.length + 1)));

  for (let index = 0; index < 2000; index++) {
    const x = 80 + (index % columns) * cellWidth;
    const y = 80 + Math.floor(index / columns) * cellHeight;
    const overlaps = map.nodes.some(
      node =>
        Math.abs(node.x - x) < NODE_WIDTH + margin &&
        Math.abs(node.y - y) < NODE_HEIGHT + margin
    );
    if (!overlaps) return { x, y };
  }

  const fallback = map.nodes.length;
  return {
    x: 80 + (fallback % columns) * cellWidth,
    y: 80 + Math.floor(fallback / columns) * cellHeight,
  };
}

function defaultDocumentPosition(map: MapRecord): { x: number; y: number } {
  const margin = 40;
  const cellWidth = DOC_WIDTH + 50;
  const cellHeight = DOC_HEIGHT + 70;
  const columns = Math.max(2, Math.ceil(Math.sqrt(map.documents.length + 1)));
  const top =
    map.nodes.length > 0
      ? Math.max(...map.nodes.map(node => node.y + NODE_HEIGHT)) + 120
      : 80;

  for (let index = 0; index < 2000; index++) {
    const x = 80 + (index % columns) * cellWidth;
    const y = top + Math.floor(index / columns) * cellHeight;
    const overlaps = map.documents.some(
      document =>
        Math.abs(document.x - x) < DOC_WIDTH + margin &&
        Math.abs(document.y - y) < DOC_HEIGHT + margin
    );
    if (!overlaps) return { x, y };
  }

  return { x: 80, y: top };
}

function mapSummary(map: MapRecord, activeMapId: string | null) {
  return {
    id: map.id,
    name: map.name,
    description: map.description,
    nodeCount: map.nodes.length,
    edgeCount: map.edges.length,
    documentCount: map.documents.length,
    imageCount: map.images.length,
    createdAt: map.createdAt,
    updatedAt: map.updatedAt,
    isActive: map.id === activeMapId,
  };
}

// ---------------------------------------------------------------------------
// Internal pure mutators (operate on a map already inside mutateDb)
// ---------------------------------------------------------------------------

function applyCreateNode(
  map: MapRecord,
  input: NodeCreateInput,
  upsert: boolean
): { node: SonionNode; created: boolean } {
  const url = normalizeUrl(input.url);
  const explicitName = input.name?.trim();
  const name = explicitName || deriveName(url);
  const duplicate = findDuplicateNode(map, url, name);

  if (duplicate && !upsert) {
    throw new DomainError(
      'DUPLICATE_NODE',
      `A node already exists with that ${url ? 'link' : 'name'}: "${duplicate.name}" (${duplicate.id}). Use upsert or update_node.`,
      409,
      { existingNodeId: duplicate.id }
    );
  }

  if (duplicate) {
    if (input.name !== undefined) duplicate.name = explicitName || duplicate.name;
    if (input.url !== undefined) duplicate.url = url;
    if (input.notes !== undefined) duplicate.notes = input.notes;
    if (input.category !== undefined) duplicate.category = input.category;
    if (input.status !== undefined) duplicate.status = input.status;
    if (input.tags !== undefined) duplicate.tags = normalizeTags(input.tags);
    if (input.x !== undefined) duplicate.x = input.x;
    if (input.y !== undefined) duplicate.y = input.y;
    duplicate.updatedAt = Date.now();
    return { node: duplicate, created: false };
  }

  const position = defaultPosition(map);
  const now = Date.now();
  const node: SonionNode = {
    id: newId('node'),
    name,
    url,
    notes: input.notes ?? '',
    category: input.category ?? 'other',
    status: input.status ?? 'untested',
    tags: normalizeTags(input.tags),
    x: input.x ?? position.x,
    y: input.y ?? position.y,
    createdAt: now,
    updatedAt: now,
  };
  map.nodes.push(node);
  map.updatedAt = now;
  return { node, created: true };
}

function applyUpdateNode(map: MapRecord, nodeId: string, patch: NodePatchInput): SonionNode {
  const node = findNode(map, nodeId);

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new DomainError('INVALID_NAME', 'The name cannot be empty.');
    node.name = name;
  }
  if (patch.url !== undefined) {
    const url = normalizeUrl(patch.url);
    const duplicate = url
      ? map.nodes.find(n => n.id !== nodeId && n.url.toLowerCase() === url.toLowerCase())
      : undefined;
    if (duplicate) {
      throw new DomainError(
        'DUPLICATE_URL',
        `Another node already uses that link: "${duplicate.name}" (${duplicate.id}).`,
        409,
        { existingNodeId: duplicate.id }
      );
    }
    node.url = url;
  }
  if (patch.notes !== undefined) node.notes = patch.notes;
  if (patch.category !== undefined) node.category = patch.category;
  if (patch.status !== undefined) node.status = patch.status;
  if (patch.tags !== undefined) node.tags = normalizeTags(patch.tags);
  if (patch.x !== undefined) node.x = patch.x;
  if (patch.y !== undefined) node.y = patch.y;
  if (patch.color !== undefined) {
    if (patch.color === null || patch.color === '') delete node.color;
    else node.color = patch.color;
  }

  node.updatedAt = Date.now();
  map.updatedAt = node.updatedAt;
  return node;
}

function applyDeleteNode(map: MapRecord, nodeId: string): { removedEdges: number } {
  findNode(map, nodeId);
  const before = map.edges.length;
  map.nodes = map.nodes.filter(n => n.id !== nodeId);
  map.edges = map.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
  map.updatedAt = Date.now();
  return { removedEdges: before - map.edges.length };
}

function applyCreateDocument(map: MapRecord, input: DocumentCreateInput): SonionDocument {
  const now = Date.now();
  const position = defaultDocumentPosition(map);
  const document: SonionDocument = {
    id: newId('doc'),
    title: input.title?.trim() || 'Untitled document',
    content: input.content ?? '',
    x: input.x ?? position.x,
    y: input.y ?? position.y,
    createdAt: now,
    updatedAt: now,
  };
  map.documents.push(document);
  map.updatedAt = now;
  return document;
}

function applyUpdateDocument(
  map: MapRecord,
  documentId: string,
  patch: DocumentPatchInput,
  cleanup = true
): SonionDocument {
  const document = findDocument(map, documentId);
  if (patch.title !== undefined) {
    document.title = patch.title.trim() || 'Untitled document';
  }
  if (patch.content !== undefined) document.content = patch.content;
  if (patch.x !== undefined) document.x = patch.x;
  if (patch.y !== undefined) document.y = patch.y;
  document.updatedAt = Date.now();
  map.updatedAt = document.updatedAt;
  if (cleanup) cleanupUnusedImages(map);
  return document;
}

function applyDeleteDocument(
  map: MapRecord,
  documentId: string,
  cleanup = true
): { removedEdges: number } {
  findDocument(map, documentId);
  const before = map.edges.length;
  map.documents = map.documents.filter(document => document.id !== documentId);
  map.edges = map.edges.filter(
    edge => edge.source !== documentId && edge.target !== documentId
  );
  if (cleanup) cleanupUnusedImages(map);
  map.updatedAt = Date.now();
  return { removedEdges: before - map.edges.length };
}

function applyCreateImage(map: MapRecord, input: ImageCreateInput): MapImage {
  const match = input.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,/i);
  if (!match) {
    throw new DomainError(
      'INVALID_IMAGE',
      'The image dataUrl must be a base64 encoded data:image/... URL.',
      422
    );
  }
  const image: MapImage = {
    id: newId('img'),
    name: input.name?.trim() || 'image',
    mimeType: input.mimeType?.trim() || match[1],
    dataUrl: input.dataUrl,
    createdAt: Date.now(),
  };
  map.images.push(image);
  map.updatedAt = image.createdAt;
  return image;
}

function applyDeleteImage(map: MapRecord, imageId: string): void {
  findImage(map, imageId);
  map.images = map.images.filter(image => image.id !== imageId);
  map.updatedAt = Date.now();
}

function applyCreateEdge(map: MapRecord, input: EdgeCreateInput): SonionEdge {
  assertConnectableEntity(map, input.source);
  assertConnectableEntity(map, input.target);
  if (input.source === input.target) {
    throw new DomainError('SELF_LOOP', 'A node or document cannot connect to itself.');
  }
  const duplicate = map.edges.find(
    e =>
      (e.source === input.source && e.target === input.target) ||
      (e.source === input.target && e.target === input.source)
  );
  if (duplicate) {
    throw new DomainError(
      'DUPLICATE_EDGE',
      `Those entities are already connected (${duplicate.id}).`,
      409,
      { existingEdgeId: duplicate.id }
    );
  }

  const edge: SonionEdge = {
    id: newId('edge'),
    source: input.source,
    target: input.target,
    style: input.style ?? 'solid',
    arrow: input.arrow ?? true,
  };
  if (input.label?.trim()) edge.label = input.label.trim();
  map.edges.push(edge);
  map.updatedAt = Date.now();
  return edge;
}

function applyUpdateEdge(map: MapRecord, edgeId: string, patch: EdgePatchInput): SonionEdge {
  const edge = findEdge(map, edgeId);
  if (patch.source !== undefined) {
    assertConnectableEntity(map, patch.source);
    edge.source = patch.source;
  }
  if (patch.target !== undefined) {
    assertConnectableEntity(map, patch.target);
    edge.target = patch.target;
  }
  if (edge.source === edge.target) {
    throw new DomainError('SELF_LOOP', 'A node or document cannot connect to itself.');
  }
  const duplicate = map.edges.find(
    e =>
      e.id !== edge.id &&
      ((e.source === edge.source && e.target === edge.target) ||
        (e.source === edge.target && e.target === edge.source))
  );
  if (duplicate) {
    throw new DomainError('DUPLICATE_EDGE', `That connection already exists (${duplicate.id}).`, 409, {
      existingEdgeId: duplicate.id,
    });
  }
  if (patch.label !== undefined) {
    if (patch.label === null || patch.label.trim() === '') delete edge.label;
    else edge.label = patch.label.trim();
  }
  if (patch.style !== undefined) edge.style = patch.style;
  if (patch.arrow !== undefined) edge.arrow = patch.arrow;
  map.updatedAt = Date.now();
  return edge;
}

function applyDeleteEdge(map: MapRecord, edgeId: string): void {
  findEdge(map, edgeId);
  map.edges = map.edges.filter(e => e.id !== edgeId);
  map.updatedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

export async function getDbInfo() {
  const db = await readDb();
  return {
    dbPath: getDbPath(),
    revision: db.revision,
    activeMapId: db.activeMapId,
    mapCount: db.maps.length,
    nodeCount: db.maps.reduce((acc, m) => acc + m.nodes.length, 0),
    edgeCount: db.maps.reduce((acc, m) => acc + m.edges.length, 0),
    documentCount: db.maps.reduce((acc, m) => acc + m.documents.length, 0),
    imageCount: db.maps.reduce((acc, m) => acc + m.images.length, 0),
  };
}

export async function listMaps() {
  const db = await readDb();
  return db.maps.map(m => mapSummary(m, db.activeMapId));
}

export async function getMap(mapId: string): Promise<MapRecord> {
  const db = await readDb();
  return findMap(db, mapId);
}

export async function createMap(input: {
  name: string;
  description?: string;
  makeActive?: boolean;
}) {
  const name = input.name?.trim();
  if (!name) throw new DomainError('INVALID_NAME', 'The map needs a name.');
  return mutateDb(db => {
    const now = Date.now();
    const map: MapRecord = {
      id: newId('map'),
      name,
      description: input.description?.trim() ?? '',
      nodes: [],
      edges: [],
      documents: [],
      images: [],
      createdAt: now,
      updatedAt: now,
    };
    db.maps.push(map);
    if (input.makeActive !== false) db.activeMapId = map.id;
    return { map, revision: db.revision + 1 };
  });
}

export async function updateMap(
  mapId: string,
  patch: { name?: string; description?: string; makeActive?: boolean }
) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new DomainError('INVALID_NAME', 'The map name cannot be empty.');
      map.name = name;
    }
    if (patch.description !== undefined) map.description = patch.description;
    if (patch.makeActive) db.activeMapId = map.id;
    map.updatedAt = Date.now();
    return { map, revision: db.revision + 1 };
  });
}

export async function deleteMap(mapId: string) {
  return mutateDb(db => {
    findMap(db, mapId);
    db.maps = db.maps.filter(m => m.id !== mapId);
    if (db.activeMapId === mapId) db.activeMapId = db.maps[0]?.id ?? null;
    return { deleted: true, activeMapId: db.activeMapId, revision: db.revision + 1 };
  });
}

export async function duplicateMap(mapId: string, name?: string) {
  return mutateDb(db => {
    const source = findMap(db, mapId);
    const now = Date.now();
    const copy: MapRecord = JSON.parse(JSON.stringify(source));
    copy.id = newId('map');
    copy.name = name?.trim() || `${source.name} (copy)`;
    copy.createdAt = now;
    copy.updatedAt = now;
    db.maps.push(copy);
    db.activeMapId = copy.id;
    return { map: copy, revision: db.revision + 1 };
  });
}

export async function listNodes(mapId: string) {
  const map = await getMap(mapId);
  return map.nodes;
}

export async function getNode(mapId: string, nodeId: string): Promise<SonionNode> {
  const map = await getMap(mapId);
  return findNode(map, nodeId);
}

export async function searchNodes(query: string, mapId?: string) {
  const db = await readDb();
  const q = (query ?? '').trim().toLowerCase();
  const maps = mapId ? [findMap(db, mapId)] : db.maps;
  if (!q) {
    return maps.flatMap(map => map.nodes.map(node => ({ mapId: map.id, mapName: map.name, node })));
  }
  const results: Array<{ mapId: string; mapName: string; node: SonionNode }> = [];
  for (const map of maps) {
    for (const node of map.nodes) {
      const haystack = [
        node.name,
        node.url,
        node.notes,
        node.category,
        node.status,
        ...node.tags,
      ]
        .join('\n')
        .toLowerCase();
      if (haystack.includes(q)) {
        results.push({ mapId: map.id, mapName: map.name, node });
      }
    }
  }
  return results;
}

export async function searchDocuments(query: string, mapId?: string) {
  const db = await readDb();
  const q = (query ?? '').trim().toLowerCase();
  const maps = mapId ? [findMap(db, mapId)] : db.maps;
  if (!q) {
    return maps.flatMap(map =>
      map.documents.map(document => ({ mapId: map.id, mapName: map.name, document }))
    );
  }
  const results: Array<{ mapId: string; mapName: string; document: SonionDocument }> = [];
  for (const map of maps) {
    for (const document of map.documents) {
      const haystack = `${document.title}\n${document.content}`.toLowerCase();
      if (haystack.includes(q)) {
        results.push({ mapId: map.id, mapName: map.name, document });
      }
    }
  }
  return results;
}

export async function listDocuments(mapId: string) {
  const map = await getMap(mapId);
  return map.documents;
}

export async function getDocument(mapId: string, documentId: string): Promise<SonionDocument> {
  const map = await getMap(mapId);
  return findDocument(map, documentId);
}

export async function addDocument(mapId: string, input: DocumentCreateInput) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const document = applyCreateDocument(map, input);
    return { document, revision: db.revision + 1 };
  });
}

export async function updateDocument(
  mapId: string,
  documentId: string,
  patch: DocumentPatchInput
) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const document = applyUpdateDocument(map, documentId, patch);
    return { document, revision: db.revision + 1 };
  });
}

export async function deleteDocument(mapId: string, documentId: string) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const result = applyDeleteDocument(map, documentId);
    return { deleted: true, ...result, revision: db.revision + 1 };
  });
}

export async function listImages(mapId: string) {
  const map = await getMap(mapId);
  return map.images;
}

export async function getImage(mapId: string, imageId: string): Promise<MapImage> {
  const map = await getMap(mapId);
  return findImage(map, imageId);
}

export async function addImage(mapId: string, input: ImageCreateInput) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const image = applyCreateImage(map, input);
    return { image, revision: db.revision + 1 };
  });
}

export async function deleteImage(mapId: string, imageId: string) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    applyDeleteImage(map, imageId);
    return { deleted: true, revision: db.revision + 1 };
  });
}

export async function addNode(mapId: string, input: NodeCreateInput, upsert = false) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const { node, created } = applyCreateNode(map, input, upsert);
    return { node, created, revision: db.revision + 1 };
  });
}

export async function updateNode(mapId: string, nodeId: string, patch: NodePatchInput) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const node = applyUpdateNode(map, nodeId, patch);
    return { node, revision: db.revision + 1 };
  });
}

export async function deleteNode(mapId: string, nodeId: string) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const result = applyDeleteNode(map, nodeId);
    return { deleted: true, ...result, revision: db.revision + 1 };
  });
}

export async function addEdge(mapId: string, input: EdgeCreateInput) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const edge = applyCreateEdge(map, input);
    return { edge, revision: db.revision + 1 };
  });
}

export async function updateEdge(mapId: string, edgeId: string, patch: EdgePatchInput) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const edge = applyUpdateEdge(map, edgeId, patch);
    return { edge, revision: db.revision + 1 };
  });
}

export async function deleteEdge(mapId: string, edgeId: string) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    applyDeleteEdge(map, edgeId);
    return { deleted: true, revision: db.revision + 1 };
  });
}

export async function organizeMap(mapId: string, options: LayoutRequest = {}) {
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const laidOut = layoutNodes(map.nodes, map.edges, options);
    const byId = new Map(laidOut.nodes.map(node => [node.id, node]));

    for (const node of map.nodes) {
      const found = byId.get(node.id);
      if (found) {
        node.x = Math.round(found.x);
        node.y = Math.round(found.y);
      }
    }

    if (map.documents.length > 0) {
      const startY =
        map.nodes.length > 0
          ? laidOut.bounds.height + 160
          : 80;
      const laidOutDocuments = layoutDocuments(map.documents, {
        startY,
        spacing: options.spacing,
      });
      const documentById = new Map(
        laidOutDocuments.map(document => [document.id, document])
      );
      for (const document of map.documents) {
        const found = documentById.get(document.id);
        if (found) {
          document.x = Math.round(found.x);
          document.y = Math.round(found.y);
        }
      }
    }

    map.updatedAt = Date.now();
    return {
      mapId,
      strategy: laidOut.strategy,
      bounds: laidOut.bounds,
      nodes: map.nodes.length,
      documents: map.documents.length,
      edges: map.edges.length,
      revision: db.revision + 1,
    };
  });
}

export async function autoLayout(mapId: string, width = 1000, height = 700, iterations = 80) {
  return organizeMap(mapId, { strategy: 'auto', width, height, iterations });
}

export async function getStats(mapId: string) {
  const map = await getMap(mapId);
  const categories: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  for (const category of NODE_CATEGORIES) categories[category] = 0;
  for (const status of NODE_STATUSES) statuses[status] = 0;

  const degree = new Map<string, number>();
  for (const edge of map.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  let onionNodes = 0;
  for (const node of map.nodes) {
    categories[node.category] = (categories[node.category] ?? 0) + 1;
    statuses[node.status] = (statuses[node.status] ?? 0) + 1;
    if (/\.onion\b/i.test(node.url)) onionNodes += 1;
  }

  const topConnected = [
    ...map.nodes.map(node => ({
      id: node.id,
      name: node.name,
      type: 'node' as const,
      degree: degree.get(node.id) ?? 0,
    })),
    ...map.documents.map(document => ({
      id: document.id,
      name: document.title,
      type: 'document' as const,
      degree: degree.get(document.id) ?? 0,
    })),
  ]
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 5);

  return {
    mapId: map.id,
    name: map.name,
    nodeCount: map.nodes.length,
    documentCount: map.documents.length,
    imageCount: map.images.length,
    edgeCount: map.edges.length,
    onionNodes,
    categories,
    statuses,
    orphanNodes: map.nodes.filter(n => !degree.has(n.id)).map(n => ({ id: n.id, name: n.name })),
    orphanDocuments: map.documents
      .filter(document => !degree.has(document.id))
      .map(document => ({ id: document.id, title: document.title })),
    topConnected,
    updatedAt: map.updatedAt,
  };
}

export async function exportData(mapIds?: string[]): Promise<ExportPackage> {
  const db = await readDb();
  let maps = db.maps;
  if (mapIds && mapIds.length > 0) {
    maps = mapIds.map(id => findMap(db, id));
  }
  if (maps.length === 0) {
    throw new DomainError('EMPTY_EXPORT', 'There are no maps to export.', 400);
  }
  return {
    app: 'SonionMaper',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    maps: JSON.parse(JSON.stringify(maps)),
    activeMapId: maps[0].id,
  };
}

function parseImportPayload(payload: unknown): MapRecord[] {
  const direct = MapSchema.safeParse(payload);
  if (direct.success) return [direct.data];

  if (Array.isArray(payload)) {
    const maps = payload.map(item => MapSchema.parse(item));
    return maps;
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as any).maps)) {
    const pkg = ExportPackageSchema.safeParse(payload);
    if (pkg.success) return pkg.data.maps;
    const maps = ((payload as any).maps as unknown[]).map(item => MapSchema.parse(item));
    return maps;
  }

  throw new DomainError(
    'INVALID_IMPORT',
    'The JSON must be a map, an array of maps, or a SonionMaper package.',
    422
  );
}

export async function importData(payload: unknown, keepIds = true) {
  const incoming = parseImportPayload(payload);
  if (incoming.length === 0) {
    throw new DomainError('INVALID_IMPORT', 'The file contains no maps.', 422);
  }
  return mutateDb(db => {
    const imported: Array<{
      id: string;
      name: string;
      nodeCount: number;
      documentCount: number;
      imageCount: number;
    }> = [];
    for (const map of incoming) {
      if (db.maps.some(m => m.id === map.id)) {
        if (keepIds) {
          throw new DomainError(
            'MAP_ID_CONFLICT',
            `A map already exists with id "${map.id}". Use keepIds=false or delete the existing one.`,
            409
          );
        }
        map.id = newId('map');
        map.name = `${map.name} (imported)`;
      }
      db.maps.push(map);
      imported.push({
        id: map.id,
        name: map.name,
        nodeCount: map.nodes.length,
        documentCount: map.documents.length,
        imageCount: map.images.length,
      });
    }
    db.activeMapId = imported[0].id;
    return { imported, activeMapId: db.activeMapId, revision: db.revision + 1 };
  });
}

export type BatchOperation =
  | { op: 'add_node'; input: NodeCreateInput; upsert?: boolean }
  | { op: 'update_node'; nodeId: string; patch: NodePatchInput }
  | { op: 'delete_node'; nodeId: string }
  | { op: 'add_edge'; input: EdgeCreateInput }
  | { op: 'update_edge'; edgeId: string; patch: EdgePatchInput }
  | { op: 'delete_edge'; edgeId: string }
  | { op: 'add_document'; input: DocumentCreateInput }
  | { op: 'update_document'; documentId: string; patch: DocumentPatchInput }
  | { op: 'delete_document'; documentId: string }
  | { op: 'add_image'; input: ImageCreateInput }
  | { op: 'delete_image'; imageId: string };

export async function batchApply(
  mapId: string,
  operations: BatchOperation[],
  layout?: LayoutRequest
) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new DomainError('EMPTY_BATCH', 'The operation batch is empty.');
  }
  if (operations.length > 200) {
    throw new DomainError('BATCH_TOO_LARGE', 'Maximum 200 operations per batch.', 413);
  }
  return mutateDb(db => {
    const map = findMap(db, mapId);
    const results: unknown[] = [];
    let cleanupImages = false;
    for (const operation of operations) {
      switch (operation.op) {
        case 'add_node': {
          const { node, created } = applyCreateNode(map, operation.input, operation.upsert ?? false);
          results.push({ op: operation.op, node, created });
          break;
        }
        case 'update_node': {
          results.push({
            op: operation.op,
            node: applyUpdateNode(map, operation.nodeId, operation.patch),
          });
          break;
        }
        case 'delete_node': {
          results.push({
            op: operation.op,
            nodeId: operation.nodeId,
            ...applyDeleteNode(map, operation.nodeId),
          });
          break;
        }
        case 'add_edge': {
          results.push({ op: operation.op, edge: applyCreateEdge(map, operation.input) });
          break;
        }
        case 'update_edge': {
          results.push({
            op: operation.op,
            edge: applyUpdateEdge(map, operation.edgeId, operation.patch),
          });
          break;
        }
        case 'delete_edge': {
          applyDeleteEdge(map, operation.edgeId);
          results.push({ op: operation.op, edgeId: operation.edgeId, deleted: true });
          break;
        }
        case 'add_document': {
          results.push({
            op: operation.op,
            document: applyCreateDocument(map, operation.input),
          });
          break;
        }
        case 'update_document': {
          cleanupImages = true;
          results.push({
            op: operation.op,
            document: applyUpdateDocument(map, operation.documentId, operation.patch, false),
          });
          break;
        }
        case 'delete_document': {
          cleanupImages = true;
          results.push({
            op: operation.op,
            documentId: operation.documentId,
            ...applyDeleteDocument(map, operation.documentId, false),
          });
          break;
        }
        case 'add_image': {
          results.push({ op: operation.op, image: applyCreateImage(map, operation.input) });
          break;
        }
        case 'delete_image': {
          applyDeleteImage(map, operation.imageId);
          results.push({ op: operation.op, imageId: operation.imageId, deleted: true });
          break;
        }
        default: {
          throw new DomainError(
            'INVALID_BATCH_OP',
            `Unknown operation: ${(operation as { op: string }).op}`,
            422
          );
        }
      }
    }

    if (cleanupImages) cleanupUnusedImages(map);

    let layoutResult: { strategy: string; bounds: { width: number; height: number } } | undefined;
    if (layout) {
      const laidOut = layoutNodes(map.nodes, map.edges, layout);
      const byId = new Map(laidOut.nodes.map(node => [node.id, node]));
      for (const node of map.nodes) {
        const found = byId.get(node.id);
        if (found) {
          node.x = Math.round(found.x);
          node.y = Math.round(found.y);
        }
      }
      if (map.documents.length > 0) {
        const laidOutDocuments = layoutDocuments(map.documents, {
          startY: map.nodes.length > 0 ? laidOut.bounds.height + 160 : 80,
          spacing: layout.spacing,
        });
        const documentById = new Map(
          laidOutDocuments.map(document => [document.id, document])
        );
        for (const document of map.documents) {
          const found = documentById.get(document.id);
          if (found) {
            document.x = Math.round(found.x);
            document.y = Math.round(found.y);
          }
        }
      }
      map.updatedAt = Date.now();
      layoutResult = { strategy: laidOut.strategy, bounds: laidOut.bounds };
    }

    return { results, layout: layoutResult, revision: db.revision + 1 };
  });
}
