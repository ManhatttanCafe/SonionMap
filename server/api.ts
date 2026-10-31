import http, { IncomingMessage, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  DomainError,
  NodeCreateInputSchema,
  NodePatchInputSchema,
  EdgeCreateInputSchema,
  EdgePatchInputSchema,
  DocumentCreateInputSchema,
  DocumentPatchInputSchema,
  ImageCreateInputSchema,
  LayoutOptionsSchema,
} from './core/schema.js';
import {
  addDocument,
  addEdge,
  addImage,
  addNode,
  organizeMap,
  batchApply,
  BatchOperation,
  createMap,
  deleteDocument,
  deleteEdge,
  deleteImage,
  deleteMap,
  deleteNode,
  duplicateMap,
  exportData,
  getDbInfo,
  getDocument,
  getImage,
  getMap,
  getNode,
  getStats,
  importData,
  listDocuments,
  listImages,
  listMaps,
  listNodes,
  searchDocuments,
  searchNodes,
  updateDocument,
  updateEdge,
  updateMap,
  updateNode,
} from './core/operations.js';
import { readDb } from './core/store.js';

const MAX_BODY_BYTES = 40_000_000;

interface ApiHandle {
  server: http.Server;
  close: () => Promise<void>;
}

const sseClients = new Set<ServerResponse>();
let lastBroadcastRevision = -1;

function withCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  withCors(res);
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof DomainError) {
    sendJson(res, error.status, {
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  if (error && typeof error === 'object' && (error as { name?: string }).name === 'ZodError') {
    sendJson(res, 422, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The submitted data is not valid.',
        details: (error as { issues?: unknown }).issues,
      },
    });
    return;
  }
  console.error('[sonionmap] unexpected error:', error);
  sendJson(res, 500, {
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error.',
    },
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new DomainError('PAYLOAD_TOO_LARGE', 'The request body is too large.', 413));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new DomainError('INVALID_JSON', 'The body is not valid JSON.', 400));
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req: IncomingMessage, url: URL): boolean {
  const token = process.env.SONIONMAP_TOKEN?.trim();
  if (!token) return true;
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const apiKey = req.headers['x-api-key'];
  const queryToken = url.searchParams.get('token') ?? undefined;
  return bearer === token || apiKey === token || queryToken === token;
}

async function broadcastIfChanged(force = false): Promise<void> {
  if (sseClients.size === 0) return;
  try {
    const db = await readDb();
    if (!force && db.revision === lastBroadcastRevision) return;
    lastBroadcastRevision = db.revision;
    const payload = `event: change\ndata: ${JSON.stringify({ revision: db.revision })}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
    }
  } catch (error) {
    console.error('[sonionmap] could not read the database for SSE:', error);
  }
}

function handleSse(req: IncomingMessage, res: ServerResponse): void {
  withCors(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected to SonionMaper\n\n');
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}

function parseBatchOperations(body: unknown): BatchOperation[] {
  const raw = (body as { operations?: unknown })?.operations;
  if (!Array.isArray(raw)) {
    throw new DomainError('INVALID_BATCH', 'The "operations" field must be an array.', 422);
  }
  return raw.map((item, index) => {
    const op = (item as { op?: string })?.op;
    try {
      switch (op) {
        case 'add_node':
          return {
            op: 'add_node',
            input: NodeCreateInputSchema.parse((item as any).input ?? {}),
            upsert: Boolean((item as any).upsert),
          };
        case 'update_node':
          return {
            op: 'update_node',
            nodeId: String((item as any).nodeId),
            patch: NodePatchInputSchema.parse((item as any).patch ?? {}),
          };
        case 'delete_node':
          return { op: 'delete_node', nodeId: String((item as any).nodeId) };
        case 'add_edge':
          return { op: 'add_edge', input: EdgeCreateInputSchema.parse((item as any).input ?? {}) };
        case 'update_edge':
          return {
            op: 'update_edge',
            edgeId: String((item as any).edgeId),
            patch: EdgePatchInputSchema.parse((item as any).patch ?? {}),
          };
        case 'delete_edge':
          return { op: 'delete_edge', edgeId: String((item as any).edgeId) };
        case 'add_document':
          return {
            op: 'add_document',
            input: DocumentCreateInputSchema.parse((item as any).input ?? {}),
          };
        case 'update_document':
          return {
            op: 'update_document',
            documentId: String((item as any).documentId),
            patch: DocumentPatchInputSchema.parse((item as any).patch ?? {}),
          };
        case 'delete_document':
          return { op: 'delete_document', documentId: String((item as any).documentId) };
        case 'add_image':
          return {
            op: 'add_image',
            input: ImageCreateInputSchema.parse((item as any).input ?? {}),
          };
        case 'delete_image':
          return { op: 'delete_image', imageId: String((item as any).imageId) };
        default:
          throw new DomainError(
            'INVALID_BATCH_OP',
            `Unknown operation at index ${index}: "${op}".`,
            422
          );
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'INVALID_BATCH_OP',
        `Invalid operation at index ${index} (${op}).`,
        422,
        error
      );
    }
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const segments = url.pathname.split('/').filter(Boolean);
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    withCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (segments[0] !== 'api') {
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    return;
  }

  if (segments[1] === 'health') {
    sendJson(res, 200, {
      ok: true,
      app: 'SonionMaper',
      server: 'sonionmap-api',
      version: '1.0.0',
      authRequired: Boolean(process.env.SONIONMAP_TOKEN?.trim()),
    });
    return;
  }

  if (!isAuthorized(req, url)) {
    sendJson(res, 401, {
      error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token (SONIONMAP_TOKEN).' },
    });
    return;
  }

  // GET /api/info
  if (segments[1] === 'info' && method === 'GET') {
    sendJson(res, 200, await getDbInfo());
    return;
  }

  // GET /api/events (SSE)
  if (segments[1] === 'events' && method === 'GET') {
    handleSse(req, res);
    return;
  }

  // /api/search
  if (segments[1] === 'search' && method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    const mapId = url.searchParams.get('mapId') ?? undefined;
    const type = url.searchParams.get('type') ?? 'nodes';
    if (type === 'documents') {
      sendJson(res, 200, await searchDocuments(q, mapId));
      return;
    }
    if (type === 'all') {
      const [nodes, documents] = await Promise.all([
        searchNodes(q, mapId),
        searchDocuments(q, mapId),
      ]);
      sendJson(res, 200, { nodes, documents });
      return;
    }
    sendJson(res, 200, await searchNodes(q, mapId));
    return;
  }

  // /api/export
  if (segments[1] === 'export' && method === 'GET') {
    const rawIds = url.searchParams.get('mapIds');
    const mapIds = rawIds
      ? rawIds
          .split(',')
          .map(id => id.trim())
          .filter(Boolean)
      : undefined;
    sendJson(res, 200, await exportData(mapIds));
    return;
  }

  // /api/import
  if (segments[1] === 'import' && method === 'POST') {
    const body = await readJsonBody(req);
    const keepIds = url.searchParams.get('keepIds') !== 'false';
    const result = await importData(body, keepIds);
    await broadcastIfChanged(true);
    sendJson(res, 200, result);
    return;
  }

  // /api/maps...
  if (segments[1] !== 'maps') {
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    return;
  }

  // GET/POST /api/maps
  if (!segments[2]) {
    if (method === 'GET') {
      sendJson(res, 200, await listMaps());
      return;
    }
    if (method === 'POST') {
      const body = (await readJsonBody(req)) as { name?: string; description?: string; makeActive?: boolean };
      const result = await createMap({
        name: String(body.name ?? ''),
        description: body.description,
        makeActive: body.makeActive,
      });
      await broadcastIfChanged(true);
      sendJson(res, 201, result);
      return;
    }
    sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
    return;
  }

  const mapId = decodeURIComponent(segments[2]);

  // /api/maps/:id
  if (!segments[3]) {
    if (method === 'GET') {
      sendJson(res, 200, await getMap(mapId));
      return;
    }
    if (method === 'PATCH') {
      const body = (await readJsonBody(req)) as {
        name?: string;
        description?: string;
        makeActive?: boolean;
      };
      const result = await updateMap(mapId, body);
      await broadcastIfChanged(true);
      sendJson(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await deleteMap(mapId);
      await broadcastIfChanged(true);
      sendJson(res, 200, result);
      return;
    }
  }

  // /api/maps/:id/duplicate
  if (segments[3] === 'duplicate' && !segments[4] && method === 'POST') {
    const body = (await readJsonBody(req)) as { name?: string };
    const result = await duplicateMap(mapId, body.name);
    await broadcastIfChanged(true);
    sendJson(res, 201, result);
    return;
  }

  // /api/maps/:id/stats
  if (segments[3] === 'stats' && !segments[4] && method === 'GET') {
    sendJson(res, 200, await getStats(mapId));
    return;
  }

  // /api/maps/:id/layout
  if (segments[3] === 'layout' && !segments[4] && method === 'POST') {
    const body = LayoutOptionsSchema.parse(await readJsonBody(req));
    const result = await organizeMap(mapId, body);
    await broadcastIfChanged(true);
    sendJson(res, 200, result);
    return;
  }

  // /api/maps/:id/batch
  if (segments[3] === 'batch' && !segments[4] && method === 'POST') {
    const body = await readJsonBody(req);
    const operations = parseBatchOperations(body);
    const rawLayout = (body as { layout?: unknown }).layout;
    const autoLayoutRequested = Boolean((body as { autoLayout?: unknown }).autoLayout);
    const layout =
      rawLayout !== undefined
        ? LayoutOptionsSchema.parse(rawLayout)
        : autoLayoutRequested
          ? {}
          : undefined;
    const result = await batchApply(mapId, operations, layout);
    await broadcastIfChanged(true);
    sendJson(res, 200, result);
    return;
  }

  // /api/maps/:id/nodes...
  if (segments[3] === 'nodes') {
    if (!segments[4]) {
      if (method === 'GET') {
        const q = url.searchParams.get('q');
        sendJson(res, 200, q ? await searchNodes(q, mapId) : await listNodes(mapId));
        return;
      }
      if (method === 'POST') {
        const body = NodeCreateInputSchema.parse(await readJsonBody(req));
        const upsert = url.searchParams.get('upsert') === 'true';
        const result = await addNode(mapId, body, upsert);
        await broadcastIfChanged(true);
        sendJson(res, result.created ? 201 : 200, result);
        return;
      }
    } else {
      const nodeId = decodeURIComponent(segments[4]);
      if (method === 'GET') {
        sendJson(res, 200, await getNode(mapId, nodeId));
        return;
      }
      if (method === 'PATCH') {
        const body = NodePatchInputSchema.parse(await readJsonBody(req));
        const result = await updateNode(mapId, nodeId, body);
        await broadcastIfChanged(true);
        sendJson(res, 200, result);
        return;
      }
      if (method === 'DELETE') {
        const result = await deleteNode(mapId, nodeId);
        await broadcastIfChanged(true);
        sendJson(res, 200, result);
        return;
      }
    }
  }

  // /api/maps/:id/documents...
  if (segments[3] === 'documents') {
    if (!segments[4]) {
      if (method === 'GET') {
        const q = url.searchParams.get('q');
        sendJson(res, 200, q ? await searchDocuments(q, mapId) : await listDocuments(mapId));
        return;
      }
      if (method === 'POST') {
        const body = DocumentCreateInputSchema.parse(await readJsonBody(req));
        const result = await addDocument(mapId, body);
        await broadcastIfChanged(true);
        sendJson(res, 201, result);
        return;
      }
    } else {
      const documentId = decodeURIComponent(segments[4]);
      if (method === 'GET') {
        sendJson(res, 200, await getDocument(mapId, documentId));
        return;
      }
      if (method === 'PATCH') {
        const body = DocumentPatchInputSchema.parse(await readJsonBody(req));
        const result = await updateDocument(mapId, documentId, body);
        await broadcastIfChanged(true);
        sendJson(res, 200, result);
        return;
      }
      if (method === 'DELETE') {
        const result = await deleteDocument(mapId, documentId);
        await broadcastIfChanged(true);
        sendJson(res, 200, result);
        return;
      }
    }
  }

  // /api/maps/:id/images...
  if (segments[3] === 'images') {
    if (!segments[4]) {
      if (method === 'GET') {
        sendJson(res, 200, await listImages(mapId));
        return;
      }
      if (method === 'POST') {
        const body = ImageCreateInputSchema.parse(await readJsonBody(req));
        const result = await addImage(mapId, body);
        await broadcastIfChanged(true);
        sendJson(res, 201, result);
        return;
      }
    } else {
      const imageId = decodeURIComponent(segments[4]);
      if (method === 'GET') {
        sendJson(res, 200, await getImage(mapId, imageId));
        return;
      }
      if (method === 'DELETE') {
        const result = await deleteImage(mapId, imageId);
        await broadcastIfChanged(true);
        sendJson(res, 200, result);
        return;
      }
    }
  }

  // /api/maps/:id/edges...
  if (segments[3] === 'edges') {
    if (!segments[4]) {
      if (method === 'POST') {
        const body = EdgeCreateInputSchema.parse(await readJsonBody(req));
        const result = await addEdge(mapId, body);
        await broadcastIfChanged(true);
        sendJson(res, 201, result);
        return;
      }
    } else {
      const edgeId = decodeURIComponent(segments[4]);
      if (method === 'PATCH') {
        const body = EdgePatchInputSchema.parse(await readJsonBody(req));
        const result = await updateEdge(mapId, edgeId, body);
        await broadcastIfChanged(true);
        sendJson(res, 200, result);
        return;
      }
      if (method === 'DELETE') {
        const result = await deleteEdge(mapId, edgeId);
        await broadcastIfChanged(true);
        sendJson(res, 200, result);
        return;
      }
    }
  }

  sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
}

export function startApi(port = Number(process.env.SONIONMAP_PORT ?? 4321), host = process.env.SONIONMAP_HOST ?? '127.0.0.1'): Promise<ApiHandle> {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(error => {
      if (!res.headersSent) sendError(res, error);
      else res.end();
    });
  });

  const poll = setInterval(() => {
    void broadcastIfChanged();
  }, 1500);

  return new Promise(resolve => {
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      console.log(`[sonionmap] API listening on http://${host}:${actualPort}`);
      console.log(`[sonionmap] SSE: http://${host}:${actualPort}/api/events`);
      console.log(`[sonionmap] Documentation: server/README.md`);
      resolve({
        server,
        close: async () => {
          clearInterval(poll);
          for (const client of sseClients) client.end();
          sseClients.clear();
          await new Promise<void>(res2 => server.close(() => res2()));
        },
      });
    });
  });
}

const isMain =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startApi().catch(error => {
    console.error('[sonionmap] could not start the API:', error);
    process.exit(1);
  });
}
