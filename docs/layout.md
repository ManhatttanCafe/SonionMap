# Automatic graph layout

Technical documentation for the SonionMaper layout engine. Its purpose is to prevent nodes from piling up, whether the map is created from the UI or by an agent through MCP, the REST API, or the CLI.

## Engine

File: `src/utils/forceLayout.ts`.

```ts
import { layoutNodes } from './src/utils/forceLayout';

const result = layoutNodes(nodes, edges, {
  strategy: 'auto',
  spacing: 70,
  width: 1200,
  height: 900,
  iterations: 140,
});

result.nodes;     // nodes with new x/y coordinates
result.strategy;  // applied strategy (never "auto")
result.bounds;    // { width, height } of the content
```

`layoutNodes` does not mutate its input. `runForceLayout` is kept for compatibility and delegates to `layoutNodes` with the `force` strategy.

Documents/posts use a separate helper:

```ts
import { layoutDocuments } from './src/utils/forceLayout';

const documents = layoutDocuments(map.documents, {
  startY: result.bounds.height + 160,
  spacing: 70,
});
```

`layoutDocuments` arranges posts in a grid below the node graph using `DOC_WIDTH × DOC_HEIGHT` (`280 × 170`). The server and the UI both call it when organizing a map.

## Strategies

| Strategy | Behavior |
|---|---|
| `auto` | Uses `force` when the map has edges and `categories` otherwise. |
| `force` | Force simulation: node repulsion, link springs, and gravity toward the center. |
| `categories` | Grid sorted by category, then by name. |
| `grid` | Simple grid sorted by name. |
| `radial` | Places the most connected node at the center and distributes the rest in rings. |

## Options

| Option | Default | Description |
|---|---|---|
| `strategy` | `auto` | Strategy to apply. |
| `spacing` | `60` | Extra separation between nodes, in pixels. |
| `width` / `height` | `1200` / `900` | Reference canvas used to pack disconnected components. |
| `iterations` | `140` | Simulation iterations for `force` and `auto`. |

## Guarantees

1. **No overlaps:** a collision separation pass runs at the end. Two nodes never share a `NODE_WIDTH × NODE_HEIGHT` area (`230 × 110`).
2. **Connected components:** each connected group is simulated independently and then packed to use the available space.
3. **Normalized coordinates:** the result starts with `80` pixels of padding and uses integer values.
4. **Isolated nodes:** isolated nodes are also placed without overlapping other nodes.
5. **Documents:** posts are placed in a separate grid below the nodes, with no overlaps between posts.
6. **Empty maps:** return an empty node list and `0 × 0` bounds; `layoutDocuments` returns an empty list.

## Server usage

### Functions

```ts
organizeMap(mapId, options);           // main entry point
autoLayout(mapId, width, height, it);  // compatibility alias
batchApply(mapId, operations, layout); // lays out the map after the batch
```

The default placement for new nodes is also overlap-free: it finds the first free cell in a grid with a 24 px margin.

### MCP

```json
{
  "name": "sonionmap_organize_map",
  "arguments": {
    "mapId": "map-...",
    "strategy": "auto",
    "spacing": 80
  }
}
```

`sonionmap_auto_layout` is an alias. `sonionmap_batch_apply` accepts `layout` or `autoLayout`.

### REST API

```bash
curl -X POST http://127.0.0.1:4321/api/maps/<mapId>/layout \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"force","spacing":70}'
```

The `/batch` endpoint accepts an optional layout request:

```json
{
  "operations": [],
  "layout": { "strategy": "auto", "spacing": 80 }
}
```

### CLI

```bash
./bin/sonionmap layout <mapId> --strategy auto --spacing 70
./bin/sonionmap organize <mapId> --strategy categories
```

Options: `--strategy`, `--spacing`, `--width`, `--height`, `--iterations`.

### UI

The auto-layout button calls `layoutNodes` with the `auto` strategy and `spacing: 70`, then places documents below the graph with `layoutDocuments`. Afterwards, `fitViewSignal` makes `GraphCanvas` fit the camera to nodes and posts. Switching maps remounts the canvas and also frames the graph.

## Tests

Verified cases:

- 40 nodes across all five strategies: zero overlaps and normalized bounds.
- Maps with multiple components and isolated nodes: zero overlaps.
- A real OSINT map with 42 nodes and 43 edges: zero overlaps.
- `organizeMap` and `batchApply` with layout against a temporary database, including documents placed below nodes.
- Real API calls to `/layout` and `/batch` with layout.
- CLI `layout` and `organize`, including strategy validation.
- MCP smoke test: `organize_map` and `batch_apply` with layout.

Commands:

```bash
npm run check
./node_modules/.bin/tsx server/smoke-test.ts
```
