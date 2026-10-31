import { z } from 'zod';

export const NODE_CATEGORIES = [
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
] as const;

export const NODE_STATUSES = ['online', 'offline', 'untested', 'warning'] as const;

export const EDGE_STYLES = ['solid', 'dashed', 'neon'] as const;

export const NodeCategorySchema = z.enum(NODE_CATEGORIES);
export const NodeStatusSchema = z.enum(NODE_STATUSES);
export const EdgeStyleSchema = z.enum(EDGE_STYLES);

export const SonionNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  url: z.string().max(4096),
  notes: z.string().max(100_000),
  category: NodeCategorySchema,
  status: NodeStatusSchema,
  tags: z.array(z.string().max(60)).max(50),
  x: z.number().finite(),
  y: z.number().finite(),
  color: z.string().max(40).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const SonionEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().max(200).optional(),
  style: EdgeStyleSchema.optional(),
  arrow: z.boolean().optional(),
});

export const SonionDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(300),
  content: z.string().max(500_000),
  x: z.number().finite(),
  y: z.number().finite(),
  color: z.string().max(40).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const MapImageSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(255),
  mimeType: z.string().max(100),
  dataUrl: z.string().min(1).max(30_000_000),
  createdAt: z.number().int().nonnegative(),
});

export const MapSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  nodes: z.array(SonionNodeSchema),
  documents: z.array(SonionDocumentSchema).default([]),
  images: z.array(MapImageSchema).default([]),
  edges: z.array(SonionEdgeSchema),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  viewPosition: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number(),
    })
    .optional(),
});

export const DatabaseSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  activeMapId: z.string().nullable(),
  maps: z.array(MapSchema),
});

export const ExportPackageSchema = z.object({
  app: z.literal('SonionMaper'),
  version: z.literal('1.0'),
  exportedAt: z.string(),
  maps: z.array(MapSchema),
  activeMapId: z.string(),
});

export type NodeCategory = z.infer<typeof NodeCategorySchema>;
export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type EdgeStyle = z.infer<typeof EdgeStyleSchema>;
export type SonionNode = z.infer<typeof SonionNodeSchema>;
export type SonionEdge = z.infer<typeof SonionEdgeSchema>;
export type SonionDocument = z.infer<typeof SonionDocumentSchema>;
export type MapImage = z.infer<typeof MapImageSchema>;
export type MapRecord = z.infer<typeof MapSchema>;
export type Database = z.infer<typeof DatabaseSchema>;
export type ExportPackage = z.infer<typeof ExportPackageSchema>;

export const NodeCreateInputSchema = z.object({
  name: z.string().max(200).optional(),
  url: z.string().max(4096).optional(),
  notes: z.string().max(100_000).optional(),
  category: NodeCategorySchema.optional(),
  status: NodeStatusSchema.optional(),
  tags: z.array(z.string()).max(50).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
});

export const NodePatchInputSchema = NodeCreateInputSchema.extend({
  color: z.string().max(40).nullable().optional(),
});

export const EdgeCreateInputSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().max(200).optional(),
  style: EdgeStyleSchema.optional(),
  arrow: z.boolean().optional(),
});

export const EdgePatchInputSchema = z.object({
  label: z.string().max(200).nullable().optional(),
  style: EdgeStyleSchema.optional(),
  arrow: z.boolean().optional(),
  source: z.string().min(1).optional(),
  target: z.string().min(1).optional(),
});

export const DocumentCreateInputSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(500_000).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  color: z.string().max(40).optional(),
});

export const DocumentPatchInputSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(500_000).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  color: z.string().max(40).nullable().optional(),
});

export const ImageCreateInputSchema = z.object({
  name: z.string().max(255).optional(),
  mimeType: z.string().max(100).optional(),
  dataUrl: z.string().min(1).max(30_000_000),
});

export const LayoutStrategySchema = z.enum(['auto', 'force', 'grid', 'categories', 'radial']);

export const LayoutOptionsSchema = z.object({
  strategy: LayoutStrategySchema.optional(),
  width: z.number().finite().positive().max(100_000).optional(),
  height: z.number().finite().positive().max(100_000).optional(),
  spacing: z.number().finite().min(0).max(1000).optional(),
  iterations: z.number().int().min(10).max(1000).optional(),
});

export type NodeCreateInput = z.infer<typeof NodeCreateInputSchema>;
export type NodePatchInput = z.infer<typeof NodePatchInputSchema>;
export type EdgeCreateInput = z.infer<typeof EdgeCreateInputSchema>;
export type EdgePatchInput = z.infer<typeof EdgePatchInputSchema>;
export type DocumentCreateInput = z.infer<typeof DocumentCreateInputSchema>;
export type DocumentPatchInput = z.infer<typeof DocumentPatchInputSchema>;
export type ImageCreateInput = z.infer<typeof ImageCreateInputSchema>;
export type LayoutStrategy = z.infer<typeof LayoutStrategySchema>;
export type LayoutRequest = z.infer<typeof LayoutOptionsSchema>;

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
