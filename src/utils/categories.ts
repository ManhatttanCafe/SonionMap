import { NodeCategory } from '../types';

export interface CategoryMeta {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
}

export const CATEGORIES: Record<NodeCategory, CategoryMeta> = {
  search: {
    label: 'Search Engine',
    color: '#38bdf8', // Sky 400
    bgColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#0284c7',
    dotColor: '#38bdf8',
  },
  directory: {
    label: 'Directory / Index',
    color: '#a855f7', // Purple 500
    bgColor: 'rgba(168, 85, 247, 0.12)',
    borderColor: '#9333ea',
    dotColor: '#a855f7',
  },
  forum: {
    label: 'Forum / Community',
    color: '#f97316', // Orange 500
    bgColor: 'rgba(249, 115, 22, 0.12)',
    borderColor: '#ea580c',
    dotColor: '#f97316',
  },
  marketplace: {
    label: 'Marketplace / Shop',
    color: '#eab308', // Yellow 500
    bgColor: 'rgba(234, 179, 8, 0.12)',
    borderColor: '#ca8a04',
    dotColor: '#eab308',
  },
  security: {
    label: 'Security / PGP / Privacy',
    color: '#10b981', // Emerald 500
    bgColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#059669',
    dotColor: '#10b981',
  },
  email: {
    label: 'Email / Messaging',
    color: '#06b6d4', // Cyan 500
    bgColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: '#0891b2',
    dotColor: '#06b6d4',
  },
  library: {
    label: 'Library / Docs / Wiki',
    color: '#ec4899', // Pink 500
    bgColor: 'rgba(236, 72, 153, 0.12)',
    borderColor: '#db2777',
    dotColor: '#ec4899',
  },
  whistleblower: {
    label: 'Leaks / Press',
    color: '#ef4444', // Red 500
    bgColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#dc2626',
    dotColor: '#ef4444',
  },
  crypto: {
    label: 'Cryptocurrency / Finance',
    color: '#8b5cf6', // Violet 500
    bgColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: '#7c3aed',
    dotColor: '#8b5cf6',
  },
  personal: {
    label: 'Blog / Personal',
    color: '#6366f1', // Indigo 500
    bgColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: '#4f46e5',
    dotColor: '#6366f1',
  },
  other: {
    label: 'Other / General',
    color: '#94a3b8', // Slate 400
    bgColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: '#64748b',
    dotColor: '#94a3b8',
  },
};
