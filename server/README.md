# SonionMaper — API, MCP, and CLI

This document describes SonionMaper's headless layer so **AI agents** and scripts can create, inspect, and modify `.onion` link maps without using the web interface.

> General documentation: [`../README.md`](../README.md). Layout engine: [`../docs/layout.md`](../docs/layout.md).

## Architecture

```text
server/
├─ core/
│  ├─ schema.ts       # types, Zod validation, and DomainError
│  ├─ store.ts        # JSON store with atomic writes and cross-process locking
│  └─ operations.ts   # domain logic (maps, nodes, documents, images, edges, layout, import/export)
├─ api.ts             # local REST API + SSE
├─ mcp.ts             # MCP server (stdio) with 32 tools
├─ cli.ts             # CLI
└─ smoke-test.ts      # MCP smoke test
bin/
├─ sonionmap          # CLI executable
└─ sonionmap-mcp      # MCP executable (stdio)
```

- **Source of truth:** a local JSON file, by default `~/.sonionmap/db.json` (override with `SONIONMAP_DB`).
- **Atomic writes** (tmp + rename) and a **directory lock** allow the API, MCP server, and CLI to run concurrently without corrupting data.
- All input is validated with **Zod**.

> **Sync:** the web UI stores maps in `localStorage`. Pressing **↻** calls `GET /api/export` and merges maps, nodes, documents, images, and edges that only exist on the server. Sync is **pull-only**: UI changes are not sent to the server. A fresh database starts with no maps. Start both with `npm run dev:all`, or start just the API with `npm run server`.

## Installation

```bash
npm install
```

Requires Node.js 20+ (tested with Node 24).

## MCP

Start the stdio server:

```bash
npm run mcp
# or
./bin/sonionmap-mcp
```

Example client configuration:

```json
{
  "mcpServers": {
    "sonionmap": {
      "command": "bash",
      "args": ["/absolute/path/to/SonionMap/bin/sonionmap-mcp"]
    }
  }
}
```

Restart your MCP client after changing its configuration.

### MCP tools

| Tool | Description |
|---|---|
| `sonionmap_get_db_info` | Database path, revision, and totals |
| `sonionmap_list_maps` | List maps (start here) |
| `sonionmap_get_map` | Full map by id |
| `sonionmap_list_nodes` | Map nodes, optionally filtered by category or status |
| `sonionmap_get_node` | Single node |
| `sonionmap_search_nodes` | Search by name, URL, notes, tags, category, or status |
| `sonionmap_list_documents` | List a map's documents/posts |
| `sonionmap_get_document` | Single document with its Markdown |
| `sonionmap_search_documents` | Search document titles and content |
| `sonionmap_get_stats` | Totals, `.onion` count, orphans, most connected nodes/documents |
| `sonionmap_create_map` | Create a map |
| `sonionmap_update_map` | Rename, describe, or mark a map active |
| `sonionmap_duplicate_map` | Duplicate a map |
| `sonionmap_delete_map` | Delete a map (requires `confirm: true`) |
| `sonionmap_add_node` | Add a node; deduplicates by URL; optional `upsert` |
| `sonionmap_update_node` | Update node fields |
| `sonionmap_delete_node` | Delete a node and its edges (requires `confirm: true`) |
| `sonionmap_add_document` | Add a Markdown post |
| `sonionmap_update_document` | Update title, content, or position |
| `sonionmap_delete_document` | Delete a post and its edges (requires `confirm: true`) |
| `sonionmap_list_images` | List stored images without their data URLs |
| `sonionmap_get_image` | Get an image including its base64 data URL |
| `sonionmap_add_image` | Store a base64 image in the map |
| `sonionmap_delete_image` | Delete a stored image (requires `confirm: true`) |
| `sonionmap_add_edge` | Connect two nodes or documents |
| `sonionmap_update_edge` | Edit label, style, endpoints, or arrow |
| `sonionmap_delete_edge` | Delete an edge (requires `confirm: true`) |
| `sonionmap_organize_map` | Lay out the graph with `auto`, `force`, `categories`, `grid`, or `radial` |
| `sonionmap_auto_layout` | Alias of `organize_map` |
| `sonionmap_batch_apply` | Atomic batch (nodes, documents, images, edges); accepts `layout` to organize afterwards |
| `sonionmap_export_maps` | Export a JSON package |
| `sonionmap_import_maps` | Import a package, map, or array of maps |

Categories: `directory`, `search`, `forum`, `marketplace`, `security`, `email`, `library`, `whistleblower`, `crypto`, `personal`, `other`.

Statuses: `online`, `offline`, `untested`, `warning`.

### Documents and images

Documents are Markdown posts stored in `MapData.documents`. They can be connected to nodes or other documents exactly like nodes: edges accept any node or document id.

Images live in `MapData.images` as base64 data URLs and are referenced from Markdown with a custom URL:

```markdown
![screenshot](sonion-image:img-123)
```

Upload the image first with `sonionmap_add_image`, then use its id. Updating or deleting a document removes images that are no longer referenced. The API accepts bodies up to 40 MB so screenshots fit comfortably.

## REST API

```bash
npm run server
# http://127.0.0.1:4321
```

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `SONIONMAP_DB` | `~/.sonionmap/db.json` | Database path |
| `SONIONMAP_PORT` | `4321` | Port |
| `SONIONMAP_HOST` | `127.0.0.1` | Listen interface |
| `SONIONMAP_TOKEN` | *(empty)* | If set, requires `Authorization: Bearer <token>` |

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Server status |
| GET | `/api/info` | Database info |
| GET | `/api/maps` | List maps |
| POST | `/api/maps` | Create a map: `{name, description?, makeActive?}` |
| GET | `/api/maps/:id` | Full map |
| PATCH | `/api/maps/:id` | Update a map |
| DELETE | `/api/maps/:id` | Delete a map |
| POST | `/api/maps/:id/duplicate` | Duplicate a map |
| GET | `/api/maps/:id/nodes?q=` | List or search nodes |
| POST | `/api/maps/:id/nodes?upsert=true` | Add a node |
| GET | `/api/maps/:id/nodes/:nodeId` | Get a node |
| PATCH | `/api/maps/:id/nodes/:nodeId` | Update a node |
| DELETE | `/api/maps/:id/nodes/:nodeId` | Delete a node |
| GET | `/api/maps/:id/documents?q=` | List or search documents |
| POST | `/api/maps/:id/documents` | Add a document |
| GET | `/api/maps/:id/documents/:documentId` | Get a document |
| PATCH | `/api/maps/:id/documents/:documentId` | Update a document |
| DELETE | `/api/maps/:id/documents/:documentId` | Delete a document |
| GET | `/api/maps/:id/images` | List stored images |
| POST | `/api/maps/:id/images` | Store a base64 image |
| GET | `/api/maps/:id/images/:imageId` | Get an image with its data URL |
| DELETE | `/api/maps/:id/images/:imageId` | Delete an image |
| POST | `/api/maps/:id/edges` | Create an edge between nodes/documents |
| PATCH | `/api/maps/:id/edges/:edgeId` | Update an edge |
| DELETE | `/api/maps/:id/edges/:edgeId` | Delete an edge |
| POST | `/api/maps/:id/layout` | Organize the graph (`strategy`, `spacing`, `width`, `height`, `iterations`) |
| GET | `/api/maps/:id/stats` | Statistics |
| POST | `/api/maps/:id/batch` | Atomic batch; optional `layout` or `autoLayout` |
| GET | `/api/search?q=&mapId=&type=` | Global/per-map search; `type=nodes` (default), `documents`, or `all` |
| GET | `/api/export?mapIds=a,b` | Export a package |
| POST | `/api/import?keepIds=false` | Import a package |
| GET | `/api/events` | SSE change events (`event: change`) |

### Examples

```bash
curl http://127.0.0.1:4321/api/maps

MAP=$(curl -s -X POST http://127.0.0.1:4321/api/maps \
  -H 'Content-Type: application/json' \
  -d '{"name":"My onion map"}' | jq -r .map.id)

curl -s -X POST "http://127.0.0.1:4321/api/maps/$MAP/nodes" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ahmia","url":"http://xxxx.onion","category":"search","tags":["search"]}'

curl -s "http://127.0.0.1:4321/api/search?q=ahmia"

# Create a Markdown document (post)
curl -s -X POST "http://127.0.0.1:4321/api/maps/$MAP/documents" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Field notes","content":"# Findings\n\nConnected to the forum node."}'

# Organize the graph (removes overlaps)
curl -s -X POST "http://127.0.0.1:4321/api/maps/$MAP/layout" \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"auto","spacing":70}'
```

### Graph organization

`POST /api/maps/:id/layout`, `sonionmap_organize_map`, and `sonionmap layout` share the same options:

| Option | Default | Description |
|---|---|---|
| `strategy` | `auto` | `auto`, `force`, `categories`, `grid`, or `radial` |
| `spacing` | `60` | Extra separation between nodes in pixels |
| `width` / `height` | `1200` / `900` | Reference canvas for packing disconnected components |
| `iterations` | `140` | Physics iterations (`force`/`auto`) |

- `auto`: uses `force` when the map has edges and `categories` otherwise.
- `force`: repulsion + link springs + collision separation; ideal for connected graphs.
- `categories`: grid grouped by category.
- `grid`: simple grid.
- `radial`: most connected node at the center.

All strategies guarantee no overlapping nodes and normalize coordinates with padding. Documents are then laid out in a grid below the nodes so they remain visible without covering the graph.

## CLI

```bash
./bin/sonionmap help

./bin/sonionmap maps
./bin/sonionmap create-map "My onion map"
./bin/sonionmap add-node <mapId> --name "Ahmia" --url http://xxxx.onion \
  --category search --status online --tag search --tag essential
./bin/sonionmap search "ahmia"
./bin/sonionmap add-document <mapId> --title "Field notes" --file notes.md
./bin/sonionmap add-image <mapId> screenshot.png
./bin/sonionmap documents <mapId>
./bin/sonionmap layout <mapId> --strategy auto --spacing 70
./bin/sonionmap organize <mapId> --strategy categories
./bin/sonionmap export <mapId> --out map.json
./bin/sonionmap import map.json --new-ids
```

The CLI prints JSON, which makes it easy for agents to parse.

## Export format

```json
{
  "app": "SonionMaper",
  "version": "1.0",
  "exportedAt": "2026-10-21T00:00:00.000Z",
  "maps": [
    {
      "id": "map-...",
      "name": "My onion map",
      "description": "",
      "nodes": [
        {
          "id": "node-...",
          "name": "Ahmia",
          "url": "http://xxxx.onion",
          "notes": "",
          "category": "search",
          "status": "online",
          "tags": ["search"],
          "x": 120,
          "y": 120,
          "createdAt": 1790000000000,
          "updatedAt": 1790000000000
        }
      ],
      "documents": [
        {
          "id": "doc-...",
          "title": "Field notes",
          "content": "# Findings\n\n![screenshot](sonion-image:img-...)",
          "x": 120,
          "y": 420,
          "createdAt": 1790000000000,
          "updatedAt": 1790000000000
        }
      ],
      "images": [
        {
          "id": "img-...",
          "name": "screenshot.png",
          "mimeType": "image/png",
          "dataUrl": "data:image/png;base64,...",
          "createdAt": 1790000000000
        }
      ],
      "edges": [],
      "createdAt": 1790000000000,
      "updatedAt": 1790000000000
    }
  ],
  "activeMapId": "map-..."
}
```

The importer also accepts a single map object or an array of maps.

## Security

- The server listens only on `127.0.0.1` by default.
- If you expose the API beyond localhost, set `SONIONMAP_TOKEN`.
- Onion links are sensitive data: do not send them to external services. This tool does **not** browse Tor or check availability.
- Destructive operations require explicit confirmation.

## Tests

```bash
npm run typecheck:server
./node_modules/.bin/tsx server/smoke-test.ts
```

The smoke test starts the MCP server against a temporary database, lists all 32 tools, and verifies map creation, node/document/image creation, cross-entity edges, search, automatic image cleanup, batch rollback, `organize_map`, layout inside `batch_apply`, stats, and guarded deletion. Layout strategies are also covered by synthetic no-overlap tests and real `/layout` and `/batch` API calls.
