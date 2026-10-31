import fs from 'node:fs/promises';
import path from 'node:path';
import {
  NodeCreateInputSchema,
  NodePatchInputSchema,
  EdgeCreateInputSchema,
  EdgePatchInputSchema,
  DocumentCreateInputSchema,
  DocumentPatchInputSchema,
  DomainError,
} from './core/schema.js';
import {
  addDocument,
  addEdge,
  addImage,
  addNode,
  organizeMap,
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

type FlagValue = string | boolean | string[];

interface ParsedArgs {
  positional: string[];
  flags: Record<string, FlagValue>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        if (key === 'tag') {
          const current = flags.tag;
          const list = Array.isArray(current) ? current : current ? [String(current)] : [];
          flags.tag = [...list, next];
        } else {
          flags[key] = next;
        }
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function str(value: FlagValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: FlagValue | undefined): number | undefined {
  const raw = str(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: FlagValue | undefined): boolean {
  return value === true || value === 'true';
}

function tagList(value: FlagValue | undefined): string[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map(t => t.trim()).filter(Boolean);
  return undefined;
}

function print(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

async function readTextFlag(flags: Record<string, FlagValue>): Promise<string | undefined> {
  const file = str(flags.file);
  if (file) return fs.readFile(path.resolve(file), 'utf8');
  return str(flags.content);
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

function fail(error: unknown): never {
  const payload =
    error instanceof DomainError
      ? { error: { code: error.code, message: error.message, details: error.details } }
      : { error: { code: 'ERROR', message: error instanceof Error ? error.message : String(error) } };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

function requirePositional(positional: string[], count: number, usage: string): void {
  if (positional.length < count) {
    throw new DomainError('MISSING_ARGUMENT', `Missing arguments. Usage: ${usage}`);
  }
}

const HELP = `SonionMaper CLI — manage onion link maps from the terminal

Usage:
  sonionmap <command> [arguments] [options]

Commands:
  serve [--port 4321] [--host 127.0.0.1]   Start the local REST API (+ SSE)
  mcp                                     Start the MCP server (stdio)
  info                                    Database information
  maps                                    List maps
  map <mapId>                             Show a complete map
  create-map <name> [--description "..."]
  rename-map <mapId> <newName> [--description "..."]
  delete-map <mapId> --yes
  duplicate-map <mapId> [--name "..."]
  nodes <mapId>                           List map nodes
  search <text> [--map <mapId>]           Search nodes in all maps or one map
  add-node <mapId> --url <url> [--name "..."] [--notes "..."] [--category forum] [--status online] [--tag t1 --tag t2] [--x 100 --y 200] [--upsert]
  update-node <mapId> <nodeId> [--name ...] [--url ...] [--notes ...] [--category ...] [--status ...] [--tag t1 --tag t2]
  delete-node <mapId> <nodeId> --yes
  documents <mapId>                       List map documents (posts)
  search-docs <text> [--map <mapId>]      Search documents by title/content
  get-document <mapId> <documentId>       Show a document with its Markdown
  add-document <mapId> [--title "..."] [--content "..."] [--file post.md] [--x 100 --y 200]
  update-document <mapId> <documentId> [--title ...] [--content ...] [--file post.md] [--x ... --y ...]
  delete-document <mapId> <documentId> --yes
  images <mapId>                          List stored images (without data)
  get-image <mapId> <imageId>             Show an image including its data URL
  add-image <mapId> <file> [--name "..."] [--mime image/png]
  delete-image <mapId> <imageId> --yes
  add-edge <mapId> <sourceId> <targetId> [--label "..."] [--style solid|dashed|neon] [--no-arrow]
  update-edge <mapId> <edgeId> [--label "..."] [--style ...] [--arrow true|false]
  delete-edge <mapId> <edgeId> --yes
  layout <mapId> [--strategy auto|force|grid|categories|radial] [--spacing 60]
                 [--width 1200] [--height 900] [--iterations 140]
  organize <mapId> [--strategy ...]        Alias of layout
  stats <mapId>
  export [mapId ...] [--all] [--out file.json]
  import <file.json> [--new-ids]

Categories: directory, search, forum, marketplace, security, email, library,
            whistleblower, crypto, personal, other
Statuses:   online, offline, untested, warning

Database: $SONIONMAP_DB (default ~/.sonionmap/db.json)
API: SONIONMAP_PORT, SONIONMAP_HOST, SONIONMAP_TOKEN`;

async function main(): Promise<void> {
  const [command = 'help', ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  switch (command) {
    case 'help':
    case '--help':
    case '-h': {
      console.log(HELP);
      return;
    }

    case 'serve': {
      const { startApi } = await import('./api.js');
      const port = num(flags.port) ?? Number(process.env.SONIONMAP_PORT ?? 4321);
      const host = str(flags.host) ?? process.env.SONIONMAP_HOST ?? '127.0.0.1';
      await startApi(port, host);
      return;
    }

    case 'mcp': {
      await import('./mcp.js');
      return;
    }

    case 'info': {
      print(await getDbInfo());
      return;
    }

    case 'maps': {
      print(await listMaps());
      return;
    }

    case 'map': {
      requirePositional(positional, 1, 'sonionmap map <mapId>');
      print(await getMap(positional[0]));
      return;
    }

    case 'create-map': {
      requirePositional(positional, 1, 'sonionmap create-map <name>');
      print(await createMap({ name: positional[0], description: str(flags.description) }));
      return;
    }

    case 'rename-map': {
      requirePositional(positional, 2, 'sonionmap rename-map <mapId> <newName>');
      print(await updateMap(positional[0], { name: positional[1], description: str(flags.description) }));
      return;
    }

    case 'delete-map': {
      requirePositional(positional, 1, 'sonionmap delete-map <mapId> --yes');
      if (!bool(flags.yes)) {
        throw new DomainError('CONFIRM_REQUIRED', 'Add --yes to confirm deleting the map.');
      }
      print(await deleteMap(positional[0]));
      return;
    }

    case 'duplicate-map': {
      requirePositional(positional, 1, 'sonionmap duplicate-map <mapId>');
      print(await duplicateMap(positional[0], str(flags.name)));
      return;
    }

    case 'nodes': {
      requirePositional(positional, 1, 'sonionmap nodes <mapId>');
      print(await listNodes(positional[0]));
      return;
    }

    case 'search': {
      requirePositional(positional, 1, 'sonionmap search <text>');
      print(await searchNodes(positional.join(' '), str(flags.map)));
      return;
    }

    case 'add-node': {
      requirePositional(positional, 1, 'sonionmap add-node <mapId> --url <url>');
      const input = NodeCreateInputSchema.parse({
        name: str(flags.name),
        url: str(flags.url),
        notes: str(flags.notes),
        category: str(flags.category),
        status: str(flags.status),
        tags: tagList(flags.tag),
        x: num(flags.x),
        y: num(flags.y),
      });
      print(await addNode(positional[0], input, bool(flags.upsert)));
      return;
    }

    case 'update-node': {
      requirePositional(positional, 2, 'sonionmap update-node <mapId> <nodeId> [opciones]');
      const patch = NodePatchInputSchema.parse({
        name: str(flags.name),
        url: str(flags.url),
        notes: str(flags.notes),
        category: str(flags.category),
        status: str(flags.status),
        tags: tagList(flags.tag),
        x: num(flags.x),
        y: num(flags.y),
      });
      print(await updateNode(positional[0], positional[1], patch));
      return;
    }

    case 'delete-node': {
      requirePositional(positional, 2, 'sonionmap delete-node <mapId> <nodeId> --yes');
      if (!bool(flags.yes)) {
        throw new DomainError('CONFIRM_REQUIRED', 'Add --yes to confirm deleting the node.');
      }
      print(await deleteNode(positional[0], positional[1]));
      return;
    }

    case 'documents': {
      requirePositional(positional, 1, 'sonionmap documents <mapId>');
      print(await listDocuments(positional[0]));
      return;
    }

    case 'search-docs': {
      requirePositional(positional, 1, 'sonionmap search-docs <text> [--map <mapId>]');
      print(await searchDocuments(positional.join(' '), str(flags.map)));
      return;
    }

    case 'get-document': {
      requirePositional(positional, 2, 'sonionmap get-document <mapId> <documentId>');
      print(await getDocument(positional[0], positional[1]));
      return;
    }

    case 'add-document': {
      requirePositional(positional, 1, 'sonionmap add-document <mapId> [--title ...]');
      const content = await readTextFlag(flags);
      const input = DocumentCreateInputSchema.parse({
        title: str(flags.title),
        content,
        x: num(flags.x),
        y: num(flags.y),
      });
      print(await addDocument(positional[0], input));
      return;
    }

    case 'update-document': {
      requirePositional(positional, 2, 'sonionmap update-document <mapId> <documentId>');
      const content = await readTextFlag(flags);
      const patch = DocumentPatchInputSchema.parse({
        title: str(flags.title),
        content,
        x: num(flags.x),
        y: num(flags.y),
      });
      print(await updateDocument(positional[0], positional[1], patch));
      return;
    }

    case 'delete-document': {
      requirePositional(positional, 2, 'sonionmap delete-document <mapId> <documentId> --yes');
      if (!bool(flags.yes)) {
        throw new DomainError('CONFIRM_REQUIRED', 'Add --yes to confirm deleting the document.');
      }
      print(await deleteDocument(positional[0], positional[1]));
      return;
    }

    case 'images': {
      requirePositional(positional, 1, 'sonionmap images <mapId>');
      const images = await listImages(positional[0]);
      print(
        images.map(image => ({
          id: image.id,
          name: image.name,
          mimeType: image.mimeType,
          createdAt: image.createdAt,
          bytes: image.dataUrl.length,
        }))
      );
      return;
    }

    case 'get-image': {
      requirePositional(positional, 2, 'sonionmap get-image <mapId> <imageId>');
      print(await getImage(positional[0], positional[1]));
      return;
    }

    case 'add-image': {
      requirePositional(positional, 2, 'sonionmap add-image <mapId> <file> [--name ...]');
      const filePath = path.resolve(positional[1]);
      const buffer = await fs.readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();
      const mimeType = str(flags.mime) ?? IMAGE_MIME_TYPES[extension] ?? 'application/octet-stream';
      if (!mimeType.startsWith('image/')) {
        throw new DomainError(
          'INVALID_IMAGE',
          `Unsupported image type "${mimeType}". Use --mime to set it explicitly.`,
          422
        );
      }
      const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
      print(
        await addImage(positional[0], {
          dataUrl,
          name: str(flags.name) ?? path.basename(filePath),
          mimeType,
        })
      );
      return;
    }

    case 'delete-image': {
      requirePositional(positional, 2, 'sonionmap delete-image <mapId> <imageId> --yes');
      if (!bool(flags.yes)) {
        throw new DomainError('CONFIRM_REQUIRED', 'Add --yes to confirm deleting the image.');
      }
      print(await deleteImage(positional[0], positional[1]));
      return;
    }

    case 'add-edge': {
      requirePositional(positional, 3, 'sonionmap add-edge <mapId> <source> <target>');
      const input = EdgeCreateInputSchema.parse({
        source: positional[1],
        target: positional[2],
        label: str(flags.label),
        style: str(flags.style),
        arrow: flags['no-arrow'] ? false : true,
      });
      print(await addEdge(positional[0], input));
      return;
    }

    case 'update-edge': {
      requirePositional(positional, 2, 'sonionmap update-edge <mapId> <edgeId> [opciones]');
      const arrow = str(flags.arrow);
      const patch = EdgePatchInputSchema.parse({
        label: str(flags.label),
        style: str(flags.style),
        arrow: arrow === undefined ? undefined : arrow === 'true',
      });
      print(await updateEdge(positional[0], positional[1], patch));
      return;
    }

    case 'delete-edge': {
      requirePositional(positional, 2, 'sonionmap delete-edge <mapId> <edgeId> --yes');
      if (!bool(flags.yes)) {
        throw new DomainError('CONFIRM_REQUIRED', 'Add --yes to confirm deleting the edge.');
      }
      print(await deleteEdge(positional[0], positional[1]));
      return;
    }

    case 'layout':
    case 'organize': {
      requirePositional(positional, 1, 'sonionmap layout <mapId> [--strategy auto]');
      const strategy = String(flags.strategy ?? 'auto');
      const allowed = ['auto', 'force', 'grid', 'categories', 'radial'];
      if (!allowed.includes(strategy)) {
        throw new DomainError(
          'INVALID_STRATEGY',
          `Invalid strategy "${strategy}". Use: ${allowed.join(', ')}.`,
          422
        );
      }
      print(
        await organizeMap(positional[0], {
          strategy: strategy as 'auto' | 'force' | 'grid' | 'categories' | 'radial',
          width: num(flags.width) ?? 1200,
          height: num(flags.height) ?? 900,
          spacing: num(flags.spacing) ?? 60,
          iterations: num(flags.iterations) ?? 140,
        })
      );
      return;
    }

    case 'stats': {
      requirePositional(positional, 1, 'sonionmap stats <mapId>');
      print(await getStats(positional[0]));
      return;
    }

    case 'export': {
      const mapIds = positional.length > 0 ? positional : undefined;
      const pkg = await exportData(mapIds);
      const out = str(flags.out);
      if (out) {
        const target = path.resolve(out);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, JSON.stringify(pkg, null, 2), 'utf8');
        print({ exportedTo: target, maps: pkg.maps.map(m => ({ id: m.id, name: m.name })) });
      } else {
        print(pkg);
      }
      return;
    }

    case 'import': {
      requirePositional(positional, 1, 'sonionmap import <file.json>');
      const raw = await fs.readFile(path.resolve(positional[0]), 'utf8');
      const payload = JSON.parse(raw);
      print(await importData(payload, !bool(flags['new-ids'])));
      return;
    }

    default: {
      throw new DomainError('UNKNOWN_COMMAND', `Unknown command: "${command}". Run "sonionmap help".`);
    }
  }
}

main().catch(fail);
