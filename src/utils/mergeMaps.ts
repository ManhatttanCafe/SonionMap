import { MapData } from '../types';

export interface MergeStats {
  addedMaps: number;
  addedNodes: number;
  addedDocuments: number;
  addedImages: number;
  addedEdges: number;
}

function cloneMap(map: MapData): MapData {
  return {
    ...map,
    documents: (map.documents ?? []).map(document => ({ ...document })),
    images: (map.images ?? []).map(image => ({ ...image })),
    nodes: (map.nodes ?? []).map(node => ({ ...node, tags: [...(node.tags ?? [])] })),
    edges: (map.edges ?? []).map(edge => ({ ...edge })),
  };
}

export function mergeServerMaps(
  localMaps: MapData[],
  serverMaps: MapData[]
): { maps: MapData[] } & MergeStats {
  const maps = localMaps.map(cloneMap);
  let addedMaps = 0;
  let addedNodes = 0;
  let addedDocuments = 0;
  let addedImages = 0;
  let addedEdges = 0;

  for (const serverMap of serverMaps) {
    const localMap = maps.find(map => map.id === serverMap.id);

    if (!localMap) {
      maps.push(cloneMap(serverMap));
      addedMaps++;
      addedNodes += (serverMap.nodes ?? []).length;
      addedDocuments += (serverMap.documents ?? []).length;
      addedImages += (serverMap.images ?? []).length;
      addedEdges += (serverMap.edges ?? []).length;
      continue;
    }

    const nodeIds = new Set(localMap.nodes.map(node => node.id));
    const documentIds = new Set(localMap.documents.map(document => document.id));
    const imageIds = new Set(localMap.images.map(image => image.id));
    const edgeIds = new Set(localMap.edges.map(edge => edge.id));
    const pairs = new Set(
      localMap.edges.flatMap(edge => [
        `${edge.source}->${edge.target}`,
        `${edge.target}->${edge.source}`,
      ])
    );
    let changed = false;

    for (const node of serverMap.nodes ?? []) {
      if (nodeIds.has(node.id)) continue;
      localMap.nodes.push({ ...node, tags: [...(node.tags ?? [])] });
      nodeIds.add(node.id);
      addedNodes++;
      changed = true;
    }

    for (const document of serverMap.documents ?? []) {
      if (documentIds.has(document.id)) continue;
      localMap.documents.push({ ...document });
      documentIds.add(document.id);
      addedDocuments++;
      changed = true;
    }

    for (const image of serverMap.images ?? []) {
      if (imageIds.has(image.id)) continue;
      localMap.images.push({ ...image });
      imageIds.add(image.id);
      addedImages++;
      changed = true;
    }

    for (const edge of serverMap.edges ?? []) {
      const pair = `${edge.source}->${edge.target}`;
      if (
        edgeIds.has(edge.id) ||
        pairs.has(pair) ||
        pairs.has(`${edge.target}->${edge.source}`)
      ) {
        continue;
      }
      localMap.edges.push({ ...edge });
      edgeIds.add(edge.id);
      pairs.add(pair);
      addedEdges++;
      changed = true;
    }

    if (changed) {
      localMap.updatedAt = Math.max(localMap.updatedAt, serverMap.updatedAt);
    }
  }

  return { maps, addedMaps, addedNodes, addedDocuments, addedImages, addedEdges };
}
