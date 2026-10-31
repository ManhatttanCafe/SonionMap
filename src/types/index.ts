export type NodeCategory = 
  | 'directory' 
  | 'search' 
  | 'forum' 
  | 'marketplace' 
  | 'security' 
  | 'email' 
  | 'library' 
  | 'whistleblower' 
  | 'crypto' 
  | 'personal'
  | 'other';

export type NodeStatus = 'online' | 'offline' | 'untested' | 'warning';

export interface SonionNode {
  id: string;
  name: string;
  url: string;
  notes: string;
  category: NodeCategory;
  status: NodeStatus;
  tags: string[];
  x: number;
  y: number;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SonionEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'neon';
  arrow?: boolean;
}

export interface SonionDocument {
  id: string;
  title: string;
  content: string;
  x: number;
  y: number;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MapImage {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: number;
}

export interface MapData {
  id: string;
  name: string;
  description: string;
  nodes: SonionNode[];
  documents: SonionDocument[];
  images: MapImage[];
  edges: SonionEdge[];
  createdAt: number;
  updatedAt: number;
  viewPosition?: { x: number; y: number; zoom: number };
}

export interface SonionExportPackage {
  app: 'SonionMaper';
  version: '1.0';
  exportedAt: string;
  maps: MapData[];
  activeMapId: string;
}
