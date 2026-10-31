import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  NodeCategorySchema,
  NodeStatusSchema,
  EdgeStyleSchema,
  LayoutStrategySchema,
  LayoutOptionsSchema,
  NODE_CATEGORIES,
  NODE_STATUSES,
  DomainError,
} from './core/schema.js';
import { ensureDb } from './core/store.js';
import {
  addDocument,
  addEdge,
  addImage,
  addNode,
  organizeMap,
  batchApply,
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

const server = new McpServer({
  name: 'sonionmap',
  version: '1.0.0',
});

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(error: unknown) {
  const payload =
    error instanceof DomainError
      ? { error: { code: error.code, message: error.message, details: error.details } }
      : { error: { code: 'ERROR', message: error instanceof Error ? error.message : String(error) } };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function register(
  name: string,
  description: string,
  inputSchema: any,
  handler: (args: any) => Promise<unknown>
) {
  server.registerTool(name, { description, inputSchema }, async (args: any) => {
    try {
      return ok(await handler(args ?? {}));
    } catch (error) {
      return fail(error);
    }
  });
}

function requireConfirm(value: unknown, action: string): void {
  if (value !== true) {
    throw new DomainError(
      'CONFIRM_REQUIRED',
      `Destructive operation blocked. Send confirm=true to ${action}.`,
      400
    );
  }
}

const categoryList = NODE_CATEGORIES.join(', ');
const statusList = NODE_STATUSES.join(', ');

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

register(
  'sonionmap_get_db_info',
  'Returns information about the local SonionMaper database: file path, revision, active map, and totals.',
  {},
  async () => getDbInfo()
);

register(
  'sonionmap_list_maps',
  'Lists all saved maps with id, name, description, node and edge counts, and which map is active. Start here to discover available mapIds.',
  {},
  async () => listMaps()
);

register(
  'sonionmap_get_map',
  'Gets a complete map by id, including all its nodes and edges.',
  {
    mapId: z.string().describe('Map id (from sonionmap_list_maps).'),
  },
  async ({ mapId }) => getMap(mapId)
);

register(
  'sonionmap_list_nodes',
  'Lists the nodes of a map, optionally filtered by category or status.',
  {
    mapId: z.string().describe('Map id.'),
    category: NodeCategorySchema.optional().describe(`Filter by category (${categoryList}).`),
    status: NodeStatusSchema.optional().describe(`Filter by status (${statusList}).`),
  },
  async ({ mapId, category, status }) => {
    const nodes = await listNodes(mapId);
    return nodes.filter(
      node => (!category || node.category === category) && (!status || node.status === status)
    );
  }
);

register(
  'sonionmap_get_node',
  'Gets a specific node from a map by its id.',
  {
    mapId: z.string().describe('Map id.'),
    nodeId: z.string().describe('Node id.'),
  },
  async ({ mapId, nodeId }) => getNode(mapId, nodeId)
);

register(
  'sonionmap_search_nodes',
  `Searches nodes by text in name, URL, notes, tags, category, or status. Without mapId, searches all maps. Returns matches with mapId, mapName, and node.`,
  {
    query: z.string().describe('Text to search for (empty returns all nodes).'),
    mapId: z.string().optional().describe('Limit the search to a specific map.'),
  },
  async ({ query, mapId }) => searchNodes(query ?? '', mapId)
);

register(
  'sonionmap_get_stats',
  'Map statistics: totals, .onion nodes, category/status distribution, orphan nodes/documents, and most connected entities.',
  {
    mapId: z.string().describe('Map id.'),
  },
  async ({ mapId }) => getStats(mapId)
);

register(
  'sonionmap_list_documents',
  'Lists the documents (posts) of a map. Documents contain Markdown content and can be connected to nodes and other documents.',
  {
    mapId: z.string().describe('Map id.'),
  },
  async ({ mapId }) => listDocuments(mapId)
);

register(
  'sonionmap_get_document',
  'Gets a document (post) by id, including its full Markdown content.',
  {
    mapId: z.string().describe('Map id.'),
    documentId: z.string().describe('Document id.'),
  },
  async ({ mapId, documentId }) => getDocument(mapId, documentId)
);

register(
  'sonionmap_search_documents',
  'Searches documents by text in title or Markdown content. Without mapId, searches all maps.',
  {
    query: z.string().describe('Text to search for (empty returns all documents).'),
    mapId: z.string().optional().describe('Limit the search to a specific map.'),
  },
  async ({ query, mapId }) => searchDocuments(query ?? '', mapId)
);

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

register(
  'sonionmap_create_map',
  'Creates a new empty map. Returns the created map. By default, marks it as active.',
  {
    name: z.string().describe('Name of the new map.'),
    description: z.string().optional().describe('Optional description.'),
    makeActive: z.boolean().optional().describe('Mark as the active map (default true).'),
  },
  async ({ name, description, makeActive }) => createMap({ name, description, makeActive })
);

register(
  'sonionmap_update_map',
  'Renames a map, changes its description, or marks it as active.',
  {
    mapId: z.string().describe('Map id.'),
    name: z.string().optional().describe('New name.'),
    description: z.string().optional().describe('New description.'),
    makeActive: z.boolean().optional().describe('Mark as the active map.'),
  },
  async ({ mapId, ...patch }) => updateMap(mapId, patch)
);

register(
  'sonionmap_duplicate_map',
  'Duplicates a complete map (nodes and edges) with a new name. The copy becomes the active map.',
  {
    mapId: z.string().describe('Id of the map to duplicate.'),
    name: z.string().optional().describe('Name of the copy (default "<name> (copy)").'),
  },
  async ({ mapId, name }) => duplicateMap(mapId, name)
);

register(
  'sonionmap_delete_map',
  'Deletes a map and all its nodes. Requires confirm=true. Does not allow deleting the last map.',
  {
    mapId: z.string().describe('Id of the map to delete.'),
    confirm: z.boolean().describe('Must be true to confirm deletion.'),
  },
  async ({ mapId, confirm }) => {
    requireConfirm(confirm, 'delete the map');
    return deleteMap(mapId);
  }
);

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

register(
  'sonionmap_add_node',
  `Adds a node (website) to a map. Each node is a website with an identifier, URL, notes, category (${categoryList}), status (${statusList}), and tags. If name is omitted, it is derived from the URL domain. Detects duplicates by URL (or by name if there is no URL); with upsert=true, updates the existing node instead of failing.`,
  {
    mapId: z.string().describe('Id of the map where the node will be created.'),
    name: z.string().optional().describe('Human-readable identifier (e.g. "Dread Forum").'),
    url: z.string().optional().describe('Site URL; .onion is supported. If the scheme is missing, http:// is added.'),
    notes: z.string().optional().describe('Notes / extra information.'),
    category: NodeCategorySchema.optional().describe(`Category (${categoryList}).`),
    status: NodeStatusSchema.optional().describe(`Status (${statusList}).`),
    tags: z.array(z.string()).optional().describe('List of tags.'),
    x: z.number().optional().describe('Optional X position on the canvas.'),
    y: z.number().optional().describe('Optional Y position on the canvas.'),
    upsert: z.boolean().optional().describe('If a node with the same URL/name exists, update it.'),
  },
  async ({ mapId, upsert, ...input }) => addNode(mapId, input, upsert ?? false)
);

register(
  'sonionmap_update_node',
  'Updates fields of an existing node. Only submitted fields are changed. Fails if the new URL already belongs to another node.',
  {
    mapId: z.string().describe('Map id.'),
    nodeId: z.string().describe('Id of the node to update.'),
    name: z.string().optional().describe('New identifier.'),
    url: z.string().optional().describe('New URL.'),
    notes: z.string().optional().describe('New notes.'),
    category: NodeCategorySchema.optional().describe('New category.'),
    status: NodeStatusSchema.optional().describe('New status.'),
    tags: z.array(z.string()).optional().describe('New tags (replaces existing ones).'),
    x: z.number().optional().describe('New X position.'),
    y: z.number().optional().describe('New Y position.'),
  },
  async ({ mapId, nodeId, ...rest }) => {
    const patch = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
    return updateNode(mapId, nodeId, patch);
  }
);

register(
  'sonionmap_delete_node',
  'Deletes a node and all its associated edges. Requires confirm=true.',
  {
    mapId: z.string().describe('Map id.'),
    nodeId: z.string().describe('Id of the node to delete.'),
    confirm: z.boolean().describe('Must be true to confirm.'),
  },
  async ({ mapId, nodeId, confirm }) => {
    requireConfirm(confirm, 'delete the node');
    return deleteNode(mapId, nodeId);
  }
);

// ---------------------------------------------------------------------------
// Documents & images
// ---------------------------------------------------------------------------

register(
  'sonionmap_add_document',
  'Adds a Markdown document (post) to a map. Use [[sonion-image:<id>]] image markdown after uploading an image with sonionmap_add_image.',
  {
    mapId: z.string().describe('Map id.'),
    title: z.string().optional().describe('Document title (default "Untitled document").'),
    content: z.string().optional().describe('Markdown content, including links and images.'),
    x: z.number().optional().describe('Optional X position on the canvas.'),
    y: z.number().optional().describe('Optional Y position on the canvas.'),
  },
  async ({ mapId, ...input }) => addDocument(mapId, input)
);

register(
  'sonionmap_update_document',
  'Updates an existing document title, Markdown content, or canvas position. Unused images are removed automatically.',
  {
    mapId: z.string().describe('Map id.'),
    documentId: z.string().describe('Id of the document to update.'),
    title: z.string().optional().describe('New title.'),
    content: z.string().optional().describe('New Markdown content.'),
    x: z.number().optional().describe('New X position.'),
    y: z.number().optional().describe('New Y position.'),
  },
  async ({ mapId, documentId, ...rest }) => {
    const patch = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
    return updateDocument(mapId, documentId, patch);
  }
);

register(
  'sonionmap_delete_document',
  'Deletes a document and its connected edges. Unused images are removed. Requires confirm=true.',
  {
    mapId: z.string().describe('Map id.'),
    documentId: z.string().describe('Id of the document to delete.'),
    confirm: z.boolean().describe('Must be true to confirm.'),
  },
  async ({ mapId, documentId, confirm }) => {
    requireConfirm(confirm, 'delete the document');
    return deleteDocument(mapId, documentId);
  }
);

register(
  'sonionmap_list_images',
  'Lists images stored in a map. Image data URLs can be large; prefer get_image only when needed.',
  {
    mapId: z.string().describe('Map id.'),
  },
  async ({ mapId }) =>
    (await listImages(mapId)).map(image => ({
      id: image.id,
      name: image.name,
      mimeType: image.mimeType,
      createdAt: image.createdAt,
      bytes: image.dataUrl.length,
    }))
);

register(
  'sonionmap_get_image',
  'Gets a stored image by id, including its full base64 data URL.',
  {
    mapId: z.string().describe('Map id.'),
    imageId: z.string().describe('Image id.'),
  },
  async ({ mapId, imageId }) => getImage(mapId, imageId)
);

register(
  'sonionmap_add_image',
  'Stores a base64 image (data:image/...;base64,...) in a map. Reference it from Markdown with ![alt](sonion-image:<imageId>).',
  {
    mapId: z.string().describe('Map id.'),
    dataUrl: z.string().describe('Base64 data URL (data:image/png;base64,...).'),
    name: z.string().optional().describe('Original file name.'),
    mimeType: z.string().optional().describe('MIME type (default image/png).'),
  },
  async ({ mapId, ...input }) => addImage(mapId, input)
);

register(
  'sonionmap_delete_image',
  'Deletes a stored image. Requires confirm=true. Documents referencing it will show a missing image.',
  {
    mapId: z.string().describe('Map id.'),
    imageId: z.string().describe('Id of the image to delete.'),
    confirm: z.boolean().describe('Must be true to confirm.'),
  },
  async ({ mapId, imageId, confirm }) => {
    requireConfirm(confirm, 'delete the image');
    return deleteImage(mapId, imageId);
  }
);

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

register(
  'sonionmap_add_edge',
  'Connects two entities (nodes or documents) in the same map with an edge. Fails if it already exists (in either direction) or if source === target.',
  {
    mapId: z.string().describe('Map id.'),
    source: z.string().describe('Source node or document id.'),
    target: z.string().describe('Target node or document id.'),
    label: z.string().optional().describe('Visible edge label.'),
    style: EdgeStyleSchema.optional().describe('Style: solid, dashed, or neon.'),
    arrow: z.boolean().optional().describe('Show arrow (default true).'),
  },
  async ({ mapId, ...input }) => addEdge(mapId, input)
);

register(
  'sonionmap_update_edge',
  'Updates an edge label, style, arrow, or endpoints.',
  {
    mapId: z.string().describe('Map id.'),
    edgeId: z.string().describe('Edge id.'),
    label: z.string().nullable().optional().describe('New label (null removes it).'),
    style: EdgeStyleSchema.optional().describe('New style.'),
    arrow: z.boolean().optional().describe('Show arrow.'),
    source: z.string().optional().describe('New source node or document id.'),
    target: z.string().optional().describe('New target node or document id.'),
  },
  async ({ mapId, edgeId, ...rest }) => {
    const patch = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
    return updateEdge(mapId, edgeId, patch);
  }
);

register(
  'sonionmap_delete_edge',
  'Deletes an edge between nodes. Requires confirm=true.',
  {
    mapId: z.string().describe('Map id.'),
    edgeId: z.string().describe('Id of the edge to delete.'),
    confirm: z.boolean().describe('Must be true to confirm.'),
  },
  async ({ mapId, edgeId, confirm }) => {
    requireConfirm(confirm, 'delete the edge');
    return deleteEdge(mapId, edgeId);
  }
);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

register(
  'sonionmap_organize_map',
  `Visually organizes a map's nodes so they are not piled up. Strategies: "auto" (recommended: uses force when there are edges, categories otherwise), "force" (physics with repulsion, springs, and collision separation; ideal for connected graphs), "categories" (groups by category in an ordered grid), "grid" (simple grid), and "radial" (most connected node at the center). Use it after creating several nodes or edges.`,
  {
    mapId: z.string().describe('Id of the map to organize.'),
    strategy: LayoutStrategySchema.optional().describe('Layout strategy (default auto).'),
    width: z.number().optional().describe('Reference canvas width (default 1200).'),
    height: z.number().optional().describe('Reference canvas height (default 900).'),
    spacing: z.number().optional().describe('Extra separation between nodes in pixels (default 60).'),
    iterations: z.number().optional().describe('Physics iterations for force/auto (default 140).'),
  },
  async ({ mapId, strategy, width, height, spacing, iterations }) =>
    organizeMap(mapId, { strategy: strategy ?? 'auto', width, height, spacing, iterations })
);

register(
  'sonionmap_auto_layout',
  'Alias of sonionmap_organize_map. Reorganizes a map nodes to avoid overlaps. Accepts strategy, spacing, and iterations.',
  {
    mapId: z.string().describe('Map id.'),
    strategy: LayoutStrategySchema.optional().describe('Strategy (default auto).'),
    width: z.number().optional().describe('Reference width (default 1200).'),
    height: z.number().optional().describe('Reference height (default 900).'),
    spacing: z.number().optional().describe('Extra separation between nodes (default 60).'),
    iterations: z.number().optional().describe('Simulation iterations (default 140).'),
  },
  async ({ mapId, strategy, width, height, spacing, iterations }) =>
    organizeMap(mapId, { strategy: strategy ?? 'auto', width, height, spacing, iterations })
);

register(
  'sonionmap_batch_apply',
  `Applies multiple operations in a single atomic transaction (all or nothing). Operations: add_node, update_node, delete_node, add_edge, update_edge, delete_edge, add_document, update_document, delete_document, add_image, delete_image. Each operation is an object such as {"op":"add_node","input":{...}} or {"op":"update_node","nodeId":"...","patch":{...}}. Ideal for importing many links at once. You can pass "layout": {"strategy":"auto"} to automatically organize the map when the batch finishes.`,
  {
    mapId: z.string().describe('Map id.'),
    operations: z
      .array(z.record(z.string(), z.unknown()))
      .describe('List of operations to apply sequentially.'),
    layout: LayoutOptionsSchema.optional().describe(
      'If set, reorganizes the map when finished. Example: {"strategy":"auto","spacing":80}.'
    ),
    autoLayout: z
      .boolean()
      .optional()
      .describe('Shortcut equivalent to layout: {"strategy":"auto"}.'),
  },
  async ({ mapId, operations, layout, autoLayout }) =>
    batchApply(mapId, operations as any, layout ?? (autoLayout ? {} : undefined))
);

register(
  'sonionmap_export_maps',
  'Exports one or more maps as a SonionMaper JSON package (for sharing or backup). Returns the JSON object; save it to a file if the user asks.',
  {
    mapIds: z.array(z.string()).optional().describe('Ids of maps to export. If omitted, exports all.'),
  },
  async ({ mapIds }) => exportData(mapIds)
);

register(
  'sonionmap_import_maps',
  'Imports maps from a SonionMaper JSON package (or a bare map/array). By default, preserves ids and fails on conflict; with keepIds=false, generates new ids and renames.',
  {
    data: z.unknown().describe('JSON object containing the package, map, or array of maps.'),
    keepIds: z.boolean().optional().describe('Preserve original ids (default true).'),
  },
  async ({ data, keepIds }) => importData(data, keepIds ?? true)
);

async function main() {
  await ensureDb();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[sonionmap-mcp] MCP server ready (stdio)');
}

main().catch(error => {
  console.error('[sonionmap-mcp] fatal error:', error);
  process.exit(1);
});
