import { SonionNode, SonionEdge, SonionDocument, NodeCategory } from '../types';

export const NODE_WIDTH = 230;
export const NODE_HEIGHT = 110;
export const DOC_WIDTH = 280;
export const DOC_HEIGHT = 170;

const DEFAULT_SPACING = 60;
const PADDING = 80;

export type LayoutStrategy = 'auto' | 'force' | 'grid' | 'categories' | 'radial';

export interface LayoutOptions {
  strategy?: LayoutStrategy;
  width?: number;
  height?: number;
  spacing?: number;
  iterations?: number;
}

export interface LayoutBounds {
  width: number;
  height: number;
}

export interface LayoutResult {
  nodes: SonionNode[];
  strategy: Exclude<LayoutStrategy, 'auto'>;
  bounds: LayoutBounds;
}

const CATEGORY_ORDER: NodeCategory[] = [
  'directory',
  'search',
  'forum',
  'marketplace',
  'security',
  'email',
  'library',
  'whistleblower',
  'crypto',
  'personal',
  'other',
];

type SimNode = SonionNode & { vx: number; vy: number };

function categoryRank(category: NodeCategory): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function sortNodes(nodes: SonionNode[], byCategory: boolean): SonionNode[] {
  return [...nodes].sort((a, b) => {
    if (byCategory) {
      const categoryDiff = categoryRank(a.category) - categoryRank(b.category);
      if (categoryDiff !== 0) return categoryDiff;
    }
    return a.name.localeCompare(b.name, 'es');
  });
}

function gridPositions(nodes: SonionNode[], spacing: number, byCategory: boolean): SonionNode[] {
  const ordered = sortNodes(nodes, byCategory);
  const cellWidth = NODE_WIDTH + spacing;
  const cellHeight = NODE_HEIGHT + spacing;
  const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length * 1.7)));

  return ordered.map((node, index) => ({
    ...node,
    x: (index % columns) * cellWidth,
    y: Math.floor(index / columns) * cellHeight,
  }));
}

function degreeMap(nodes: SonionNode[], edges: SonionEdge[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

function radialPositions(nodes: SonionNode[], edges: SonionEdge[], spacing: number): SonionNode[] {
  if (nodes.length === 0) return [];
  const degree = degreeMap(nodes, edges);
  const ordered = [...nodes].sort((a, b) => {
    const diff = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'es');
  });

  const [center, ...remaining] = ordered;
  const positioned: SonionNode[] = [
    { ...center, x: -NODE_WIDTH / 2, y: -NODE_HEIGHT / 2 },
  ];

  const baseRadius = Math.max(NODE_HEIGHT + spacing + 110, 240);
  let ring = 1;
  let cursor = 0;

  while (cursor < remaining.length) {
    const radius = ring * baseRadius;
    const circumference = 2 * Math.PI * radius;
    const capacity = Math.max(4, Math.floor(circumference / (NODE_WIDTH + spacing)));
    const count = Math.min(capacity, remaining.length - cursor);
    const angleOffset = ring % 2 === 0 ? 0 : Math.PI / Math.max(count, 1);

    for (let i = 0; i < count; i++) {
      const angle = angleOffset + (2 * Math.PI * i) / count;
      positioned.push({
        ...remaining[cursor++],
        x: Math.cos(angle) * radius - NODE_WIDTH / 2,
        y: Math.sin(angle) * radius - NODE_HEIGHT / 2,
      });
    }
    ring++;
  }

  separateOverlaps(positioned, spacing, 60);
  return positioned;
}

function connectedComponents(nodes: SonionNode[], edges: SonionEdge[]): SonionNode[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node.id, new Set());
  for (const edge of edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }

  const visited = new Set<string>();
  const components: SonionNode[][] = [];

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const stack = [node.id];
    const componentIds = new Set<string>();

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (componentIds.has(id)) continue;
      componentIds.add(id);
      visited.add(id);
      for (const next of adjacency.get(id) ?? []) {
        if (!componentIds.has(next)) stack.push(next);
      }
    }

    components.push(nodes.filter(n => componentIds.has(n.id)));
  }

  return components;
}

function simulateComponent(
  component: SonionNode[],
  edges: SonionEdge[],
  spacing: number,
  iterations: number
): SonionNode[] {
  const cellWidth = NODE_WIDTH + spacing;
  const cellHeight = NODE_HEIGHT + spacing;
  const columns = Math.max(1, Math.ceil(Math.sqrt(component.length)));

  const nodes: SimNode[] = component.map((node, index) => ({
    ...node,
    vx: 0,
    vy: 0,
    x: (index % columns) * cellWidth,
    y: Math.floor(index / columns) * cellHeight,
  }));

  const byId = new Map(nodes.map(node => [node.id, node]));
  const internalEdges = edges.filter(edge => byId.has(edge.source) && byId.has(edge.target));
  const rows = Math.ceil(nodes.length / columns);
  const centerX = ((columns - 1) * cellWidth) / 2;
  const centerY = ((rows - 1) * cellHeight) / 2;

  const repulsion = 32000;
  const spring = 0.045;
  const idealDistance = NODE_WIDTH + spacing + 20;
  const damping = 0.82;
  const gravity = 0.012;

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const first = nodes[i];
        const second = nodes[j];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distanceSquared = dx * dx + dy * dy + 100;
        const distance = Math.sqrt(distanceSquared);
        const force = repulsion / distanceSquared;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        first.vx -= fx;
        first.vy -= fy;
        second.vx += fx;
        second.vy += fy;
      }
    }

    for (const edge of internalEdges) {
      const source = byId.get(edge.source)!;
      const target = byId.get(edge.target)!;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (distance - idealDistance) * spring;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    for (const node of nodes) {
      node.vx += (centerX - node.x) * gravity;
      node.vy += (centerY - node.y) * gravity;
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= damping;
      node.vy *= damping;
    }
  }

  separateOverlaps(nodes, spacing, 60);
  return nodes.map(({ vx, vy, ...rest }) => rest);
}

function separateOverlaps<T extends { x: number; y: number }>(
  nodes: T[],
  spacing: number,
  maxIterations: number
): void {
  const minDistanceX = NODE_WIDTH + spacing;
  const minDistanceY = NODE_HEIGHT + spacing;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let moved = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const first = nodes[i];
        const second = nodes[j];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const overlapX = minDistanceX - Math.abs(dx);
        const overlapY = minDistanceY - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;

        if (overlapX < overlapY) {
          const push = (overlapX / 2 + 0.5) * (dx >= 0 ? 1 : -1);
          first.x -= push;
          second.x += push;
        } else {
          const push = (overlapY / 2 + 0.5) * (dy >= 0 ? 1 : -1);
          first.y -= push;
          second.y += push;
        }
      }
    }

    if (!moved) break;
  }
}

function componentBounds(nodes: SonionNode[]) {
  const minX = Math.min(...nodes.map(node => node.x));
  const minY = Math.min(...nodes.map(node => node.y));
  const maxX = Math.max(...nodes.map(node => node.x + NODE_WIDTH));
  const maxY = Math.max(...nodes.map(node => node.y + NODE_HEIGHT));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function packComponents(
  components: SonionNode[][],
  spacing: number,
  options: LayoutOptions = {}
): SonionNode[] {
  const boxes = components
    .map(nodes => {
      const bounds = componentBounds(nodes);
      return {
        nodes: nodes.map(node => ({
          ...node,
          x: node.x - bounds.minX,
          y: node.y - bounds.minY,
        })),
        width: bounds.width,
        height: bounds.height,
      };
    })
    .sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));

  const totalArea = boxes.reduce((sum, box) => sum + box.width * box.height, 0);
  const aspect =
    options.width && options.height
      ? Math.min(3, Math.max(0.4, options.width / options.height))
      : 1.8;
  const targetWidth = Math.max(NODE_WIDTH * 2, Math.sqrt(totalArea * aspect));
  const gap = spacing * 1.5;
  const positioned: SonionNode[] = [];

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const box of boxes) {
    if (cursorX > 0 && cursorX + box.width > targetWidth) {
      cursorX = 0;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }
    for (const node of box.nodes) {
      positioned.push({
        ...node,
        x: Math.round(node.x + cursorX),
        y: Math.round(node.y + cursorY),
      });
    }
    cursorX += box.width + gap;
    rowHeight = Math.max(rowHeight, box.height);
  }

  return positioned;
}

function forcePositions(nodes: SonionNode[], edges: SonionEdge[], options: LayoutOptions): SonionNode[] {
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const iterations = options.iterations ?? 140;
  const components = connectedComponents(nodes, edges);
  const laidOut = components.map(component =>
    component.length === 1
      ? [{ ...component[0], x: 0, y: 0 }]
      : simulateComponent(component, edges, spacing, iterations)
  );
  return packComponents(laidOut, spacing, options);
}

function normalizePositions(nodes: SonionNode[]): { nodes: SonionNode[]; bounds: LayoutBounds } {
  if (nodes.length === 0) return { nodes: [], bounds: { width: 0, height: 0 } };

  const minX = Math.min(...nodes.map(node => node.x));
  const minY = Math.min(...nodes.map(node => node.y));
  const maxX = Math.max(...nodes.map(node => node.x + NODE_WIDTH));
  const maxY = Math.max(...nodes.map(node => node.y + NODE_HEIGHT));
  const shiftX = PADDING - minX;
  const shiftY = PADDING - minY;

  return {
    nodes: nodes.map(node => ({
      ...node,
      x: Math.round(node.x + shiftX),
      y: Math.round(node.y + shiftY),
    })),
    bounds: {
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
    },
  };
}

function resolveStrategy(
  strategy: LayoutStrategy | undefined,
  edges: SonionEdge[]
): Exclude<LayoutStrategy, 'auto'> {
  if (strategy && strategy !== 'auto') return strategy;
  return edges.length > 0 ? 'force' : 'categories';
}

export function layoutNodes(
  nodes: SonionNode[],
  edges: SonionEdge[],
  options: LayoutOptions = {}
): LayoutResult {
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const strategy = resolveStrategy(options.strategy, edges);
  const sizing = {
    width: options.width ?? 1200,
    height: options.height ?? 900,
  };

  if (nodes.length === 0) {
    return { nodes: [], strategy, bounds: { width: 0, height: 0 } };
  }

  let positioned: SonionNode[];

  switch (strategy) {
    case 'force':
      positioned = forcePositions(nodes, edges, { ...options, ...sizing, spacing });
      break;
    case 'grid':
      positioned = gridPositions(nodes, spacing, false);
      break;
    case 'radial':
      positioned = radialPositions(nodes, edges, spacing);
      break;
    case 'categories':
    default:
      positioned = gridPositions(nodes, spacing, true);
      break;
  }

  const normalized = normalizePositions(positioned);
  return { nodes: normalized.nodes, strategy, bounds: normalized.bounds };
}

export function layoutDocuments(
  documents: SonionDocument[],
  options: { startX?: number; startY?: number; spacing?: number; columns?: number } = {}
): SonionDocument[] {
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const startX = options.startX ?? PADDING;
  const startY = options.startY ?? PADDING;
  const ordered = [...documents].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  const columns = Math.max(
    1,
    options.columns ?? Math.ceil(Math.sqrt(Math.max(ordered.length, 1) * 1.4))
  );

  return ordered.map((document, index) => ({
    ...document,
    x: startX + (index % columns) * (DOC_WIDTH + spacing),
    y: startY + Math.floor(index / columns) * (DOC_HEIGHT + spacing),
  }));
}

export function runForceLayout(
  nodes: SonionNode[],
  edges: SonionEdge[],
  width: number = 1000,
  height: number = 700,
  iterations: number = 80
): SonionNode[] {
  return layoutNodes(nodes, edges, { strategy: 'force', width, height, iterations }).nodes;
}
