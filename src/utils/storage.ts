import { MapData, SonionExportPackage } from '../types';

export function normalizeMapData(map: MapData): MapData {
  return {
    ...map,
    description: map.description ?? '',
    nodes: Array.isArray(map.nodes) ? map.nodes : [],
    documents: Array.isArray(map.documents) ? map.documents : [],
    images: Array.isArray(map.images) ? map.images : [],
    edges: Array.isArray(map.edges) ? map.edges : [],
  };
}

const STORAGE_MAPS_KEY = 'sonion_maps_v2';
const STORAGE_ACTIVE_MAP_KEY = 'sonion_active_map_id_v2';
const LEGACY_STORAGE_MAPS_KEY = 'sonion_maps_v1';
const LEGACY_STORAGE_ACTIVE_MAP_KEY = 'sonion_active_map_id_v1';

export function loadMapsFromStorage(): { maps: MapData[]; activeId: string } {
  try {
    localStorage.removeItem(LEGACY_STORAGE_MAPS_KEY);
    localStorage.removeItem(LEGACY_STORAGE_ACTIVE_MAP_KEY);

    const rawMaps = localStorage.getItem(STORAGE_MAPS_KEY);
    const activeId = localStorage.getItem(STORAGE_ACTIVE_MAP_KEY);

    if (!rawMaps) return { maps: [], activeId: '' };

    const parsed: MapData[] = JSON.parse(rawMaps);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { maps: [], activeId: '' };
    }

    const normalized = parsed.map(normalizeMapData);
    const validActiveId = normalized.some(m => m.id === activeId)
      ? (activeId as string)
      : normalized[0].id;
    return { maps: normalized, activeId: validActiveId };
  } catch (error) {
    console.error('Error loading maps from localStorage:', error);
    return { maps: [], activeId: '' };
  }
}

export function saveMapsToStorage(maps: MapData[], activeId?: string): void {
  try {
    localStorage.setItem(STORAGE_MAPS_KEY, JSON.stringify(maps));
    if (activeId) {
      localStorage.setItem(STORAGE_ACTIVE_MAP_KEY, activeId);
    } else {
      localStorage.removeItem(STORAGE_ACTIVE_MAP_KEY);
    }
  } catch (error) {
    console.error('Error saving maps to localStorage:', error);
  }
}

export function exportMapAsJson(map: MapData): void {
  const exportData: SonionExportPackage = {
    app: 'SonionMaper',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    maps: [map],
    activeMapId: map.id
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  const safeTitle = map.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  link.href = url;
  link.download = `sonionmap_${safeTitle}_${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportAllMapsAsJson(maps: MapData[], activeId: string): void {
  const exportData: SonionExportPackage = {
    app: 'SonionMaper',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    maps,
    activeMapId: activeId
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `sonionmap_backup_all_${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseImportedJson(jsonText: string): { maps: MapData[]; suggestedActiveId?: string } {
  const parsed = JSON.parse(jsonText);

  // Case 1: Standard SonionExportPackage
  if (parsed && parsed.app === 'SonionMaper' && Array.isArray(parsed.maps)) {
    const validMaps = parsed.maps.filter(isValidMapData).map(normalizeMapData);
    if (validMaps.length > 0) {
      return { maps: validMaps, suggestedActiveId: parsed.activeMapId };
    }
  }

  // Case 2: Direct Single Map object
  if (isValidMapData(parsed)) {
    return { maps: [normalizeMapData(parsed)], suggestedActiveId: parsed.id };
  }

  // Case 3: Array of Maps
  if (Array.isArray(parsed) && parsed.every(isValidMapData)) {
    return { maps: parsed.map(normalizeMapData), suggestedActiveId: parsed[0]?.id };
  }

  throw new Error('The imported file does not contain a valid SonionMaper structure.');
}

function isValidMapData(obj: any): obj is MapData {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.nodes) &&
    Array.isArray(obj.edges)
  );
}
