import { MapData, SonionExportPackage } from '../types';

const DEFAULT_API = 'http://127.0.0.1:4321';

function getApiBase(): string {
  const configured = import.meta.env.VITE_SONIONMAP_API as string | undefined;
  return (configured || DEFAULT_API).replace(/\/+$/, '');
}

export async function fetchServerMaps(timeoutMs = 2500): Promise<MapData[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getApiBase()}/api/export`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as SonionExportPackage;
    if (!data || !Array.isArray(data.maps)) return null;

    return data.maps.filter(
      map =>
        map &&
        typeof map.id === 'string' &&
        typeof map.name === 'string' &&
        Array.isArray(map.nodes) &&
        Array.isArray(map.edges)
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export { mergeServerMaps } from './mergeMaps';
export type { MergeStats } from './mergeMaps';
