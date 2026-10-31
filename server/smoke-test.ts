import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const dbPath = path.join(os.tmpdir(), `sonionmap-mcp-smoke-${Date.now()}.json`);

async function parseToolResult(result: any) {
  const text = result?.content?.find((c: any) => c.type === 'text')?.text;
  return text ? JSON.parse(text) : result;
}

async function main() {
  const tsx = path.resolve('node_modules/.bin/tsx');
  const transport = new StdioClientTransport({
    command: tsx,
    args: ['server/mcp.ts'],
    cwd: process.cwd(),
    env: { ...process.env, SONIONMAP_DB: dbPath },
    stderr: 'pipe',
  });

  const client = new Client({ name: 'sonionmap-smoke', version: '1.0.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(`MCP tools: ${tools.tools.length}`);
  console.log(tools.tools.map(t => `- ${t.name}`).join('\n'));

  const maps = await parseToolResult(await client.callTool({ name: 'sonionmap_list_maps', arguments: {} }));
  console.log(`Initial maps: ${maps.length}`);

  const created = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_create_map',
      arguments: { name: 'MCP Smoke Map' },
    })
  );
  const mapId = created.map.id;

  const added = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_add_node',
      arguments: {
        mapId,
        name: 'MCP Node',
        url: 'http://mcp-test.onion',
        category: 'search',
        status: 'online',
        tags: ['mcp', 'smoke'],
        notes: 'Node created by the test client',
      },
    })
  );

  const found = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_search_nodes',
      arguments: { query: 'mcp-test', mapId },
    })
  );

  const image = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_add_image',
      arguments: {
        mapId,
        name: 'pixel.png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        mimeType: 'image/png',
      },
    })
  );

  const document = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_add_document',
      arguments: {
        mapId,
        title: 'MCP Post',
        content: `# Notes\n\nConnected to the node.\n\n![pixel](sonion-image:${image.image.id})`,
      },
    })
  );

  const documentEdge = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_add_edge',
      arguments: {
        mapId,
        source: added.node.id,
        target: document.document.id,
        label: 'documents',
      },
    })
  );

  const foundDocuments = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_search_documents',
      arguments: { query: 'mcp post', mapId },
    })
  );

  const imagesBeforeCleanup = await parseToolResult(
    await client.callTool({ name: 'sonionmap_list_images', arguments: { mapId } })
  );

  await client.callTool({
    name: 'sonionmap_update_document',
    arguments: { mapId, documentId: document.document.id, content: 'No images remain.' },
  });

  const imagesAfterCleanup = await parseToolResult(
    await client.callTool({ name: 'sonionmap_list_images', arguments: { mapId } })
  );

  // A batch with a valid node and an invalid edge must fail completely (rollback).
  const failedBatch = await client.callTool({
    name: 'sonionmap_batch_apply',
    arguments: {
      mapId,
      operations: [
        {
          op: 'add_node',
          input: { name: 'Rollback Node', url: 'http://rollback.onion', category: 'forum' },
        },
        {
          op: 'add_edge',
          input: { source: added.node.id, target: 'PLACEHOLDER', label: 'batch' },
        },
      ],
    },
  });

  const statsAfterFailedBatch = await parseToolResult(
    await client.callTool({ name: 'sonionmap_get_stats', arguments: { mapId } })
  );

  const batchOk = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_batch_apply',
      arguments: {
        mapId,
        operations: [
          {
            op: 'add_node',
            input: { name: 'Batch Node', url: 'http://batch.onion', category: 'forum' },
          },
        ],
        layout: { strategy: 'grid', spacing: 70 },
      },
    })
  );

  const organized = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_organize_map',
      arguments: { mapId, strategy: 'categories', spacing: 70 },
    })
  );

  const mapAfterLayout = await parseToolResult(
    await client.callTool({ name: 'sonionmap_get_map', arguments: { mapId } })
  );
  const uniquePositions = new Set(mapAfterLayout.nodes.map((node: any) => `${node.x},${node.y}`));

  const stats = await parseToolResult(
    await client.callTool({ name: 'sonionmap_get_stats', arguments: { mapId } })
  );

  const exported = await parseToolResult(
    await client.callTool({ name: 'sonionmap_export_maps', arguments: { mapIds: [mapId] } })
  );

  const deletedDocument = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_delete_document',
      arguments: { mapId, documentId: document.document.id, confirm: true },
    })
  );

  const statsAfterDocumentDelete = await parseToolResult(
    await client.callTool({ name: 'sonionmap_get_stats', arguments: { mapId } })
  );

  const unauthorizedDelete = await client.callTool({
    name: 'sonionmap_delete_node',
    arguments: { mapId, nodeId: added.node.id, confirm: false },
  });

  console.log('Node created:', added.node.name, added.node.id);
  console.log('Document created:', document.document.title, document.document.id);
  console.log('Node <-> document edge:', documentEdge.edge.label);
  console.log('Search results:', found.length, 'documents:', foundDocuments.length);
  console.log('Images before/after cleanup:', imagesBeforeCleanup.length, imagesAfterCleanup.length);
  console.log('Invalid batch rejected:', failedBatch.isError === true);
  console.log('Successful rollback (nodes after failure):', statsAfterFailedBatch.nodeCount);
  console.log('Valid batch applied:', batchOk.results.length);
  console.log(
    'Batch/organize layout:',
    batchOk.layout?.strategy,
    organized.strategy,
    'unique positions:',
    uniquePositions.size
  );
  console.log(
    'Node/document/edge stats:',
    stats.nodeCount,
    stats.documentCount,
    stats.edgeCount
  );
  console.log('Document deletion removed edges:', deletedDocument.removedEdges);
  console.log(
    'After document deletion:',
    statsAfterDocumentDelete.nodeCount,
    statsAfterDocumentDelete.documentCount,
    statsAfterDocumentDelete.edgeCount
  );
  console.log('Export app/maps:', exported.app, exported.maps.length);
  console.log('Delete without confirm returns an error:', unauthorizedDelete.isError === true);

  const deletedMap = await parseToolResult(
    await client.callTool({
      name: 'sonionmap_delete_map',
      arguments: { mapId, confirm: true },
    })
  );
  const mapsAfterDelete = await parseToolResult(
    await client.callTool({ name: 'sonionmap_list_maps', arguments: {} })
  );
  console.log(
    'Last map deleted:',
    deletedMap.deleted === true,
    'remaining:',
    mapsAfterDelete.length
  );

  await client.close();
  await fs.rm(dbPath, { force: true });

  const ok =
    tools.tools.length === 32 &&
    maps.length === 0 &&
    found.length === 1 &&
    foundDocuments.length === 1 &&
    documentEdge.edge.label === 'documents' &&
    imagesBeforeCleanup.length === 1 &&
    imagesAfterCleanup.length === 0 &&
    failedBatch.isError === true &&
    statsAfterFailedBatch.nodeCount === 1 &&
    batchOk.results.length === 1 &&
    batchOk.layout?.strategy === 'grid' &&
    organized.strategy === 'categories' &&
    uniquePositions.size === 2 &&
    stats.nodeCount === 2 &&
    stats.documentCount === 1 &&
    stats.edgeCount === 1 &&
    deletedDocument.removedEdges === 1 &&
    statsAfterDocumentDelete.nodeCount === 2 &&
    statsAfterDocumentDelete.documentCount === 0 &&
    statsAfterDocumentDelete.edgeCount === 0 &&
    exported.app === 'SonionMaper' &&
    exported.maps.length === 1 &&
    exported.maps[0].documents.length === 1 &&
    unauthorizedDelete.isError === true &&
    deletedMap.deleted === true &&
    mapsAfterDelete.length === 0;
  if (!ok) {
    console.error('SMOKE TEST FAILED');
    process.exit(1);
  }
  console.log('MCP SMOKE TEST OK');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
