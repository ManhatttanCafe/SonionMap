import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapData, SonionNode, SonionEdge, SonionDocument, MapImage } from './types';
import { loadMapsFromStorage, saveMapsToStorage, exportMapAsJson, exportAllMapsAsJson, parseImportedJson } from './utils/storage';
import {
  layoutNodes,
  layoutDocuments,
  NODE_HEIGHT,
  DOC_WIDTH,
  DOC_HEIGHT,
} from './utils/forceLayout';
import { fetchServerMaps, mergeServerMaps } from './utils/serverSync';
import { extractImageIds } from './utils/markdown';
import { prepareImageFile } from './utils/images';
import { TopBar } from './components/TopBar';
import { GraphCanvas } from './components/GraphCanvas';
import { NodeInspector } from './components/NodeInspector';
import { MapManagerModal } from './components/MapManagerModal';
import { DocumentEditorModal } from './components/DocumentEditorModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Plus, FileText } from 'lucide-react';

function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateEdgeId(): string {
  return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateImageId(): string {
  return `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function removeUnusedImages(map: MapData): MapData {
  const used = new Set<string>();
  for (const document of map.documents) {
    for (const imageId of extractImageIds(document.content)) used.add(imageId);
  }
  const images = map.images.filter(image => used.has(image.id));
  if (images.length === map.images.length) return map;
  return { ...map, images };
}

export default function App() {
  // --- Global State ---
  const [maps, setMaps] = useState<MapData[]>([]);
  const [activeMapId, setActiveMapId] = useState<string>('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMapManagerOpen, setIsMapManagerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fitViewSignal, setFitViewSignal] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // --- Initialize from localStorage ---
  useEffect(() => {
    const { maps: loadedMaps, activeId } = loadMapsFromStorage();
    setMaps(loadedMaps);
    setActiveMapId(activeId);
    setIsInitialized(true);
  }, []);

  // --- Persist to localStorage on every change ---
  useEffect(() => {
    if (isInitialized) {
      saveMapsToStorage(maps, activeMapId);
    }
  }, [maps, activeMapId, isInitialized]);

  // --- Active Map ---
  const activeMap = useMemo(
    () => maps.find(m => m.id === activeMapId),
    [maps, activeMapId]
  );

  useEffect(() => {
    if (maps.length === 0) {
      if (activeMapId) setActiveMapId('');
      return;
    }
    if (!maps.some(m => m.id === activeMapId)) {
      setActiveMapId(maps[0].id);
    }
  }, [maps, activeMapId]);

  // --- Selected Node ---
  const selectedNode = useMemo(
    () => activeMap?.nodes.find(n => n.id === selectedNodeId) || null,
    [activeMap, selectedNodeId]
  );

  const openDocument = useMemo(
    () => activeMap?.documents.find(document => document.id === openDocumentId) || null,
    [activeMap, openDocumentId]
  );

  // --- Search Filtering ---
  const highlightedNodeIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !activeMap) return new Set<string>();
    const result = new Set<string>();
    for (const node of activeMap.nodes) {
      if (
        node.name.toLowerCase().includes(q) ||
        node.url.toLowerCase().includes(q) ||
        (node.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (node.notes || '').toLowerCase().includes(q)
      ) {
        result.add(node.id);
      }
    }
    return result;
  }, [searchQuery, activeMap]);

  const highlightedDocumentIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !activeMap) return new Set<string>();
    const result = new Set<string>();
    for (const document of activeMap.documents) {
      if (
        document.title.toLowerCase().includes(q) ||
        document.content.toLowerCase().includes(q)
      ) {
        result.add(document.id);
      }
    }
    return result;
  }, [searchQuery, activeMap]);

  // --- Toast System ---
  const showToast = useCallback(
    (title: string, message?: string, type: 'success' | 'warning' | 'info' | 'error' = 'info') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts(prev => [...prev, { id, title, message, type }]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // --- Server sync (API/MCP) ---
  const applyServerMaps = useCallback(
    (serverMaps: MapData[], baseMaps: MapData[]) => {
      const {
        maps: merged,
        addedMaps,
        addedNodes,
        addedDocuments,
        addedImages,
        addedEdges,
      } = mergeServerMaps(baseMaps, serverMaps);
      if (addedMaps + addedNodes + addedDocuments + addedImages + addedEdges === 0) {
        return false;
      }

      setMaps(merged);
      const firstNewMap = merged.find(map => !baseMaps.some(local => local.id === map.id));
      if (firstNewMap) {
        setActiveMapId(firstNewMap.id);
        setSelectedNodeId(null);
        setSelectedDocumentId(null);
      }

      const parts = [
        addedMaps > 0 ? `${addedMaps} map(s)` : '',
        addedNodes > 0 ? `${addedNodes} node(s)` : '',
        addedDocuments > 0 ? `${addedDocuments} post(s)` : '',
        addedImages > 0 ? `${addedImages} image(s)` : '',
        addedEdges > 0 ? `${addedEdges} edge(s)` : '',
      ]
        .filter(Boolean)
        .join(', ');
      showToast('Synced with server', `Added ${parts}.`, 'success');
      return true;
    },
    [showToast]
  );

  const handleSyncServer = useCallback(async () => {
    setIsSyncing(true);
    const serverMaps = await fetchServerMaps();
    setIsSyncing(false);

    if (!serverMaps) {
      showToast(
        'Server unavailable',
        'Start the API with "npm run server" and try again.',
        'warning'
      );
      return;
    }

    if (!applyServerMaps(serverMaps, maps)) {
      showToast('No changes', 'The UI is already up to date with the server.', 'info');
    }
  }, [applyServerMaps, maps, showToast]);

  // --- Map CRUD Helpers ---
  const updateActiveMap = useCallback(
    (updater: (map: MapData) => MapData) => {
      setMaps(prev => prev.map(m => (m.id === activeMapId ? { ...updater(m), updatedAt: Date.now() } : m)));
    },
    [activeMapId]
  );

  // --- Node CRUD ---
  const handleCreateNode = useCallback(
    (x?: number, y?: number) => {
      if (!activeMap) return;
      const defaultX = x ?? 400 + Math.round((Math.random() - 0.5) * 200);
      const defaultY = y ?? 300 + Math.round((Math.random() - 0.5) * 200);

      const newNode: SonionNode = {
        id: generateId(),
        name: 'New Node',
        url: '',
        notes: '',
        category: 'other',
        status: 'untested',
        tags: [],
        x: defaultX,
        y: defaultY,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      updateActiveMap(map => ({
        ...map,
        nodes: [...map.nodes, newNode],
      }));
      setSelectedNodeId(newNode.id);
      setSelectedDocumentId(null);
      showToast('Node Created', 'Edit its details in the right panel.', 'success');
    },
    [activeMap, updateActiveMap, showToast]
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Partial<SonionNode>) => {
      updateActiveMap(map => ({
        ...map,
        nodes: map.nodes.map(n => (n.id === nodeId ? { ...n, ...updates } : n)),
      }));
    },
    [updateActiveMap]
  );

  const handleUpdateNodePosition = useCallback(
    (nodeId: string, x: number, y: number) => {
      updateActiveMap(map => ({
        ...map,
        nodes: map.nodes.map(n => (n.id === nodeId ? { ...n, x, y } : n)),
      }));
    },
    [updateActiveMap]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      updateActiveMap(map => ({
        ...map,
        nodes: map.nodes.filter(n => n.id !== nodeId),
        edges: map.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      }));
      setSelectedNodeId(null);
    },
    [updateActiveMap]
  );

  // --- Document CRUD ---
  const handleCreateDocument = useCallback(
    (x?: number, y?: number) => {
      if (!activeMap) return;
      const now = Date.now();
      const nodesBottom =
        activeMap.nodes.length > 0
          ? Math.max(...activeMap.nodes.map(node => node.y + NODE_HEIGHT))
          : 80;
      const documentsBottom =
        activeMap.documents.length > 0
          ? Math.max(...activeMap.documents.map(document => document.y + DOC_HEIGHT))
          : 80;
      const top = Math.max(nodesBottom, documentsBottom) + 120;
      const index = activeMap.documents.length;
      const document: SonionDocument = {
        id: generateDocumentId(),
        title: 'Untitled document',
        content: '',
        x: x ?? 120 + (index % 3) * (DOC_WIDTH + 40),
        y: y ?? top + Math.floor(index / 3) * (DOC_HEIGHT + 60),
        createdAt: now,
        updatedAt: now,
      };

      updateActiveMap(map => ({
        ...map,
        documents: [...map.documents, document],
      }));
      setSelectedNodeId(null);
      setSelectedDocumentId(document.id);
      setOpenDocumentId(document.id);
      showToast('Post Created', 'Write your post in the editor.', 'success');
    },
    [activeMap, updateActiveMap, showToast]
  );

  const handleSaveDocument = useCallback(
    (documentId: string, updates: { title: string; content: string }) => {
      updateActiveMap(map => {
        const documents = map.documents.map(document =>
          document.id === documentId
            ? { ...document, ...updates, updatedAt: Date.now() }
            : document
        );
        return removeUnusedImages({ ...map, documents });
      });
      setOpenDocumentId(null);
      setSelectedDocumentId(documentId);
      showToast('Post Saved', 'The document was saved in this map.', 'success');
    },
    [updateActiveMap, showToast]
  );

  const handleUpdateDocumentPosition = useCallback(
    (documentId: string, x: number, y: number) => {
      updateActiveMap(map => ({
        ...map,
        documents: map.documents.map(document =>
          document.id === documentId ? { ...document, x, y } : document
        ),
      }));
    },
    [updateActiveMap]
  );

  const handleDeleteDocument = useCallback(
    (documentId: string) => {
      updateActiveMap(map => {
        const documents = map.documents.filter(document => document.id !== documentId);
        return removeUnusedImages({
          ...map,
          documents,
          edges: map.edges.filter(
            edge => edge.source !== documentId && edge.target !== documentId
          ),
        });
      });
      setOpenDocumentId(null);
      setSelectedDocumentId(null);
      showToast('Post Deleted', 'The document and its connections were removed.', 'warning');
    },
    [updateActiveMap, showToast]
  );

  const handleOpenDocument = useCallback((documentId: string) => {
    setSelectedNodeId(null);
    setSelectedDocumentId(documentId);
    setOpenDocumentId(documentId);
  }, []);

  const handleCloseDocument = useCallback(() => {
    setOpenDocumentId(null);
    updateActiveMap(map => removeUnusedImages(map));
  }, [updateActiveMap]);

  const handleAddImage = useCallback(
    async (file: File): Promise<MapImage | null> => {
      if (!activeMap) return null;
      const prepared = await prepareImageFile(file);
      if (!prepared) return null;

      const image: MapImage = {
        id: generateImageId(),
        name: prepared.name,
        mimeType: prepared.mimeType,
        dataUrl: prepared.dataUrl,
        createdAt: Date.now(),
      };

      updateActiveMap(map => ({ ...map, images: [...map.images, image] }));
      return image;
    },
    [activeMap, updateActiveMap]
  );

  // --- Edge CRUD ---
  const handleCreateEdge = useCallback(
    (sourceId: string, targetId: string) => {
      if (!activeMap) return;
      const exists = activeMap.edges.some(
        e =>
          (e.source === sourceId && e.target === targetId) ||
          (e.source === targetId && e.target === sourceId)
      );
      if (exists) {
        showToast('Edge Already Exists', 'These items are already connected.', 'warning');
        return;
      }

      const newEdge: SonionEdge = {
        id: generateEdgeId(),
        source: sourceId,
        target: targetId,
        style: 'solid',
        arrow: true,
      };

      updateActiveMap(map => ({
        ...map,
        edges: [...map.edges, newEdge],
      }));
      showToast('Edge Created', 'The items are now connected.', 'success');
    },
    [activeMap, updateActiveMap, showToast]
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      updateActiveMap(map => ({
        ...map,
        edges: map.edges.filter(e => e.id !== edgeId),
      }));
      showToast('Edge Deleted', 'The connection was removed.', 'warning');
    },
    [updateActiveMap, showToast]
  );

  // --- Auto Layout ---
  const handleAutoLayout = useCallback(() => {
    if (!activeMap || (activeMap.nodes.length === 0 && activeMap.documents.length === 0)) return;
    const result = layoutNodes(activeMap.nodes, activeMap.edges, {
      strategy: 'auto',
      width: 1200,
      height: 900,
      spacing: 70,
    });
    const documents = layoutDocuments(activeMap.documents, {
      startY: 80 + result.bounds.height + (activeMap.documents.length > 0 ? 80 : 0),
      spacing: 70,
    });
    updateActiveMap(map => ({
      ...map,
      nodes: map.nodes.map(n => {
        const found = result.nodes.find(l => l.id === n.id);
        return found ? { ...n, x: Math.round(found.x), y: Math.round(found.y) } : n;
      }),
      documents: map.documents.map(document => {
        const found = documents.find(l => l.id === document.id);
        return found ? { ...document, x: found.x, y: found.y } : document;
      }),
    }));
    setFitViewSignal(signal => signal + 1);
    showToast(
      'Map Auto-Organized',
      `Nodes and posts reorganized using the "${result.strategy}" strategy.`,
      'info'
    );
  }, [activeMap, updateActiveMap, showToast]);

  // --- Map CRUD ---
  const handleCreateMap = useCallback(
    (name: string, description: string) => {
      const newMap: MapData = {
        id: `map-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        description,
        nodes: [],
        documents: [],
        images: [],
        edges: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setMaps(prev => [...prev, newMap]);
      setActiveMapId(newMap.id);
      setSelectedNodeId(null);
      setSelectedDocumentId(null);
      setOpenDocumentId(null);
      showToast('Map Created', `"${name}" is ready to use.`, 'success');
    },
    [showToast]
  );

  const handleDuplicateMap = useCallback(
    (mapId: string) => {
      const source = maps.find(m => m.id === mapId);
      if (!source) return;
      const copy: MapData = {
        ...JSON.parse(JSON.stringify(source)),
        id: `map-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${source.name} (copy)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setMaps(prev => [...prev, copy]);
      showToast('Map Duplicated', `Created a copy of "${source.name}".`, 'success');
    },
    [maps, showToast]
  );

  const handleDeleteMap = useCallback(
    (mapId: string) => {
      const next = maps.filter(m => m.id !== mapId);
      setMaps(next);
      if (mapId === activeMapId) {
        setActiveMapId(next[0]?.id ?? '');
      }
      setSelectedNodeId(null);
      setSelectedDocumentId(null);
      setOpenDocumentId(null);
      showToast('Map Deleted', 'The map was removed from your database.', 'warning');
    },
    [maps, activeMapId, showToast]
  );

  const handleExportMapById = useCallback(
    (mapId: string) => {
      const map = maps.find(m => m.id === mapId);
      if (map) {
        exportMapAsJson(map);
        showToast('Exported', `Map "${map.name}" was exported as JSON.`, 'success');
      }
    },
    [maps, showToast]
  );

  const handleExportActive = useCallback(() => {
    if (activeMap) {
      exportMapAsJson(activeMap);
      showToast('Exported', `Map "${activeMap.name}" was exported.`, 'success');
    }
  }, [activeMap, showToast]);

  const handleExportAll = useCallback(() => {
    if (maps.length > 0) {
      exportAllMapsAsJson(maps, activeMapId);
      showToast('Full Backup', `${maps.length} map(s) exported.`, 'success');
    }
  }, [maps, activeMapId, showToast]);

  const handleImportJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const { maps: importedMaps, suggestedActiveId } = parseImportedJson(text);

          setMaps(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMaps = importedMaps.map(m => {
              if (existingIds.has(m.id)) {
                return {
                  ...m,
                  id: `map-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: `${m.name} (imported)`,
                };
              }
              return m;
            });
            const merged = [...prev, ...newMaps];
            if (newMaps.length > 0) {
              setActiveMapId(newMaps[0].id);
            }
            return merged;
          });

          setSelectedNodeId(null);
          setSelectedDocumentId(null);
          setOpenDocumentId(null);
          setIsMapManagerOpen(false);
          showToast(
            'Import Successful',
            `${importedMaps.length} map(s) imported successfully.`,
            'success'
          );
        } catch (err) {
          showToast(
            'Import Error',
            'The file is not a valid SonionMaper format.',
            'error'
          );
        }
      };
      reader.readAsText(file);
    },
    [showToast]
  );

  // --- Focus on node (from search result click) ---
  const handleNavigateToNode = useCallback(
    (nodeId: string) => {
      setSelectedDocumentId(null);
      setSelectedNodeId(nodeId);
    },
    []
  );

  // --- Keyboard shortcut: Escape to deselect ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setSelectedDocumentId(null);
        setIsMapManagerOpen(false);
      }
      if (e.key === 'n' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        handleCreateNode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateNode]);

  // --- Render ---
  return (
    <div className="h-screen w-screen flex flex-col bg-tor-bg text-slate-100 overflow-hidden">
      {/* Top Bar */}
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeMapName={activeMap?.name || ''}
        maps={maps}
        activeMapId={activeMapId}
        onSelectMap={(id) => {
          setActiveMapId(id);
          setSelectedNodeId(null);
          setSelectedDocumentId(null);
          setOpenDocumentId(null);
          setSearchQuery('');
        }}
        onAddNode={() => handleCreateNode()}
        onAddDocument={() => handleCreateDocument()}
        onAutoLayout={handleAutoLayout}
        onSyncServer={handleSyncServer}
        isSyncing={isSyncing}
        onExportActiveMap={handleExportActive}
        onExportAll={handleExportAll}
        onImportJson={handleImportJson}
        onOpenMapManager={() => setIsMapManagerOpen(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Graph Canvas */}
        <div className="flex-1 relative">
          {activeMap ? (
            <GraphCanvas
              key={activeMapId}
              nodes={activeMap.nodes}
              documents={activeMap.documents}
              edges={activeMap.edges}
              selectedNodeId={selectedNodeId}
              selectedDocumentId={selectedDocumentId}
              highlightedNodeIds={highlightedNodeIds}
              highlightedDocumentIds={highlightedDocumentIds}
              onSelectNode={(nodeId) => {
                setSelectedDocumentId(null);
                setSelectedNodeId(nodeId);
              }}
              onSelectDocument={setSelectedDocumentId}
              onOpenDocument={handleOpenDocument}
              onUpdateNodePosition={handleUpdateNodePosition}
              onUpdateDocumentPosition={handleUpdateDocumentPosition}
              onCreateEdge={handleCreateEdge}
              onDeleteEdge={handleDeleteEdge}
              onCreateNodeAt={(x, y) => handleCreateNode(x, y)}
              onShowToast={showToast}
              onFocusNode={handleNavigateToNode}
              fitViewSignal={fitViewSignal}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              <p className="text-lg">No maps. Create one from the Map Manager.</p>
            </div>
          )}

          {/* Search Results Indicator */}
          {searchQuery && activeMap && (
            <div className="absolute top-4 right-4 z-20 bg-tor-panel/95 backdrop-blur-md border border-tor-border rounded-xl px-4 py-2.5 shadow-xl">
              <p className="text-xs text-slate-300">
                {highlightedNodeIds.size + highlightedDocumentIds.size > 0 ? (
                  <>
                    <span className="text-cyan-400 font-bold">
                      {highlightedNodeIds.size + highlightedDocumentIds.size}
                    </span>
                    {highlightedNodeIds.size + highlightedDocumentIds.size === 1
                      ? ' result found'
                      : ' results found'}
                  </>
                ) : (
                  <span className="text-rose-400">No results</span>
                )}
              </p>
            </div>
          )}

          {/* Quick Add Node Button (floating) */}
          {activeMap && activeMap.nodes.length === 0 && activeMap.documents.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center pointer-events-auto animate-fade-in">
                <div className="w-20 h-20 rounded-2xl bg-tor-panel border-2 border-dashed border-tor-border flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-400 text-sm mb-1">Empty map</p>
                <p className="text-slate-600 text-xs mb-4">Double-click the canvas or use a button to start</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => handleCreateNode()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors shadow-glow-purple"
                  >
                    Create First Node
                  </button>
                  <button
                    onClick={() => handleCreateDocument()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Create First Post
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Node Inspector Sidebar */}
        {selectedNode && activeMap && (
          <NodeInspector
            node={selectedNode}
            allNodes={activeMap.nodes}
            allDocuments={activeMap.documents}
            edges={activeMap.edges}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
            onShowToast={showToast}
            onNavigateToNode={handleNavigateToNode}
            onOpenDocument={handleOpenDocument}
          />
        )}
      </div>

      {/* Map Manager Modal */}
      <MapManagerModal
        isOpen={isMapManagerOpen}
        maps={maps}
        activeMapId={activeMapId}
        onClose={() => setIsMapManagerOpen(false)}
        onSelectMap={(id) => {
          setActiveMapId(id);
          setSelectedNodeId(null);
          setSelectedDocumentId(null);
          setOpenDocumentId(null);
          setSearchQuery('');
        }}
        onCreateMap={handleCreateMap}
        onDuplicateMap={handleDuplicateMap}
        onDeleteMap={handleDeleteMap}
        onExportMap={handleExportMapById}
        onImportJson={handleImportJson}
      />

      {/* Document / Post Editor */}
      {openDocument && activeMap && (
        <DocumentEditorModal
          key={openDocument.id}
          document={openDocument}
          images={activeMap.images}
          onSave={handleSaveDocument}
          onDelete={handleDeleteDocument}
          onClose={handleCloseDocument}
          onAddImage={handleAddImage}
          onShowToast={showToast}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
