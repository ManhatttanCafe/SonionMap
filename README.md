# SonionMaper

SonionMaper is a local-first tool for **manually mapping the internet**, with a focus on `.onion` links. Each **node** represents a website and stores a name, URL, notes, category, status, and tags. You can also create **documents/posts** written in Markdown with images, and connect nodes and documents with edges to build an interactive graph.

The project has two layers that share the same data model:

- **Web UI** for people, persisted in `localStorage`.
- **Headless layer** for scripts and AI agents: MCP server, REST API, and CLI, persisted in `~/.sonionmap/db.json`.

The UI performs a **pull sync** from the API on demand: press **↻** to merge maps created by an agent. A fresh installation starts with no maps.

## Features

- Create, edit, move, and delete nodes, documents/posts, and edges.
- Markdown posts with GFM tables, links, task lists, and inline images stored in the map database.
- Connect documents to nodes or other documents, and open them with a click on the canvas.
- Categories, statuses, notes, tags, and full-text search across nodes and posts.
- Multiple maps with JSON import/export.
- Overlap-free graph layouts: `auto`, `force`, `categories`, `grid`, and `radial`.
- MCP server with 32 `sonionmap_*` tools.
- Local REST API with optional token authentication and SSE change events.
- JSON CLI output designed for agents.
- Atomic JSON storage with cross-process locking.

## Requirements

- Node.js 20 or newer (tested with Node 24).
- npm.

## Quick start

```bash
npm install
npm run dev:all
```

Open `http://localhost:5173`. `dev:all` starts both the UI and the REST API at `http://127.0.0.1:4321`.

To run only the UI:

```bash
npm run dev
```

Without the API, the UI still works with `localStorage`, but it will not see maps created by agents.

## Using the UI

- **Double-click** the canvas to create a node.
- Select a node to edit it in the right sidebar.
- Click **New Post** to create a Markdown document; click a post card on the canvas to edit it.
- Drag the purple or amber handle to connect nodes and documents.
- Use **Auto layout** to redistribute the graph and **↻** to sync server maps.
- The maximize button fits the camera to the entire graph.
- Export and import maps from the top bar.

## Using SonionMaper from AI agents

The recommended option is the MCP server. Start it over stdio:

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

The CLI is also available:

```bash
./bin/sonionmap help
./bin/sonionmap maps
./bin/sonionmap create-map "My onion map"
./bin/sonionmap add-node <mapId> --name "Ahmia" --url http://xxxx.onion --category search
./bin/sonionmap add-document <mapId> --title "Field notes" --file notes.md
./bin/sonionmap add-image <mapId> screenshot.png
./bin/sonionmap layout <mapId> --strategy auto --spacing 70
./bin/sonionmap export <mapId> --out map.json
```

Or use the REST API:

```bash
npm run server
curl http://127.0.0.1:4321/api/maps
```

Full headless documentation: [`server/README.md`](server/README.md).

## Graph layout

The layout engine lives in `src/utils/forceLayout.ts` and is shared by the UI, API, MCP server, and CLI.

| Strategy | Description |
|---|---|
| `auto` | Recommended: `force` when the map has edges, `categories` otherwise. |
| `force` | Spring simulation with repulsion, link springs, and collision separation. |
| `categories` | Grid grouped by category. |
| `grid` | Simple alphabetical grid. |
| `radial` | Places the most connected node at the center. |

Every strategy removes overlaps and normalizes coordinates. Technical details: [`docs/layout.md`](docs/layout.md).

## Persistence and sync

- **UI:** `localStorage` keys `sonion_maps_v2` and `sonion_active_map_id_v2`.
- A fresh install starts empty; no sample or starter maps are bundled.
- **Agents:** `~/.sonionmap/db.json`, configurable with `SONIONMAP_DB`.
- Sync is **server → UI only (pull)** and runs only when you press **↻**. Changes made in the UI are not sent to the server.
- To move UI data to the server, export from the UI and import with `./bin/sonionmap import file.json`.

## Verification

```bash
npm run check                                  # web build + server typecheck
./node_modules/.bin/tsx server/smoke-test.ts   # MCP smoke test
```

The smoke test covers MCP tool registration, CRUD, documents and images, search, batch rollback, `organize_map`, layout inside `batch_apply`, and safe deletion.

## Project structure

```text
src/              React UI
server/core/      schemas, JSON store, and domain operations
server/api.ts     REST API + SSE
server/mcp.ts     MCP server
server/cli.ts     CLI
bin/              CLI and MCP executables
docs/             technical documentation
scripts/          development scripts
```

## Documentation

- [`server/README.md`](server/README.md) — MCP, REST API, and CLI reference.
- [`docs/layout.md`](docs/layout.md) — automatic graph layout engine.

## Security

- The API listens on `127.0.0.1` by default.
- If you expose it beyond localhost, set `SONIONMAP_TOKEN`.
- Do not invent `.onion` addresses: only store links that are provided or verified.
- Destructive operations require explicit confirmation.

## Development

- Validate server input with Zod.
- Run `npm run check` after every change.
- Do not commit automatically; create commits only when explicitly requested.
