import React, { useRef, useState, useEffect, useCallback } from 'react';
import { SonionNode, SonionEdge, SonionDocument } from '../types';
import { CATEGORIES } from '../utils/categories';
import { formatUrlDisplay, isOnionUrl, isV3Onion, copyToClipboard } from '../utils/onion';
import { DOC_HEIGHT, DOC_WIDTH, NODE_HEIGHT, NODE_WIDTH } from '../utils/forceLayout';
import { documentPreview, wordCount } from '../utils/markdown';
import { 
  Copy, 
  ExternalLink, 
  FileText, 
  Plus, 
  Link2, 
  Trash2, 
  Globe, 
  ShieldAlert, 
  CheckCircle,
  HelpCircle,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';

interface GraphCanvasProps {
  nodes: SonionNode[];
  documents: SonionDocument[];
  edges: SonionEdge[];
  selectedNodeId: string | null;
  selectedDocumentId: string | null;
  highlightedNodeIds: Set<string>;
  highlightedDocumentIds: Set<string>;
  onSelectNode: (nodeId: string | null) => void;
  onSelectDocument: (documentId: string | null) => void;
  onOpenDocument: (documentId: string) => void;
  onUpdateNodePosition: (nodeId: string, x: number, y: number) => void;
  onUpdateDocumentPosition: (documentId: string, x: number, y: number) => void;
  onCreateEdge: (sourceId: string, targetId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onCreateNodeAt: (x: number, y: number) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'warning' | 'info' | 'error') => void;
  onFocusNode?: (nodeId: string) => void;
  fitViewSignal?: number;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  documents,
  edges,
  selectedNodeId,
  selectedDocumentId,
  highlightedNodeIds,
  highlightedDocumentIds,
  onSelectNode,
  onSelectDocument,
  onOpenDocument,
  onUpdateNodePosition,
  onUpdateDocumentPosition,
  onCreateEdge,
  onDeleteEdge,
  onCreateNodeAt,
  onShowToast,
  fitViewSignal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera Pan and Zoom state
  const [pan, setPan] = useState({ x: 250, y: 150 });
  const [zoom, setZoom] = useState(1);

  // Dragging Canvas state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dragging Node state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0 });

  // Dragging Document state
  const [draggingDocumentId, setDraggingDocumentId] = useState<string | null>(null);
  const [documentDragOffset, setDocumentDragOffset] = useState({ x: 0, y: 0 });
  const documentDragMovedRef = useRef(false);

  // Connection Dragging state
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [connectionCurrentPoint, setConnectionCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoveredTargetNodeId, setHoveredTargetNodeId] = useState<string | null>(null);

  // Selected edge state
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Convert Screen Coordinates to World (Canvas) Coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const relX = screenX - rect.left;
    const relY = screenY - rect.top;
    return {
      x: (relX - pan.x) / zoom,
      y: (relY - pan.y) / zoom
    };
  }, [pan, zoom]);

  // Convert World Coordinates to Screen Coordinates
  const worldToScreen = useCallback((worldX: number, worldY: number) => {
    return {
      x: worldX * zoom + pan.x,
      y: worldY * zoom + pan.y
    };
  }, [pan, zoom]);

  // Zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = Math.min(Math.max(zoom * zoomFactor, 0.25), 2.5);

    // Zoom centered at mouse position
    const newPanX = mouseX - (mouseX - pan.x) * (nextZoom / zoom);
    const newPanY = mouseY - (mouseY - pan.y) * (nextZoom / zoom);

    setZoom(nextZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const fitToContent = useCallback(() => {
    if (!containerRef.current || (nodes.length === 0 && documents.length === 0)) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const boxes = [
      ...nodes.map(node => ({
        x: node.x,
        y: node.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
      ...documents.map(document => ({
        x: document.x,
        y: document.y,
        width: DOC_WIDTH,
        height: DOC_HEIGHT,
      })),
    ];

    const minX = Math.min(...boxes.map(box => box.x));
    const minY = Math.min(...boxes.map(box => box.y));
    const maxX = Math.max(...boxes.map(box => box.x + box.width));
    const maxY = Math.max(...boxes.map(box => box.y + box.height));
    const contentWidth = Math.max(maxX - minX, 1);
    const contentHeight = Math.max(maxY - minY, 1);
    const padding = 100;

    const nextZoom = Math.min(
      Math.max(Math.min(
        (rect.width - padding * 2) / contentWidth,
        (rect.height - padding * 2) / contentHeight
      ), 0.25),
      1.25
    );

    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - ((minX + maxX) / 2) * nextZoom,
      y: rect.height / 2 - ((minY + maxY) / 2) * nextZoom,
    });
  }, [nodes, documents]);

  useEffect(() => {
    if (fitViewSignal === undefined) return;
    fitToContent();
  }, [fitViewSignal]);

  // Center on node if requested
  const focusOnCoordinates = useCallback((worldX: number, worldY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setPan({
      x: centerX - (worldX + NODE_WIDTH / 2) * zoom,
      y: centerY - (worldY + NODE_HEIGHT / 2) * zoom
    });
  }, [zoom]);

  // Background pointer down (start panning canvas)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && !(e.target as HTMLElement).classList.contains('canvas-bg')) {
      return;
    }
    onSelectNode(null);
    onSelectDocument(null);
    setSelectedEdgeId(null);
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // Canvas double click to create node
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && !(e.target as HTMLElement).classList.contains('canvas-bg')) {
      return;
    }
    const worldPos = screenToWorld(e.clientX, e.clientY);
    onCreateNodeAt(Math.round(worldPos.x - NODE_WIDTH / 2), Math.round(worldPos.y - NODE_HEIGHT / 2));
  };

  // Pointer move handler (handles pan, node drag, connecting drag)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    if (draggingNodeId) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const newX = Math.round(worldPos.x - nodeDragOffset.x);
      const newY = Math.round(worldPos.y - nodeDragOffset.y);
      onUpdateNodePosition(draggingNodeId, newX, newY);
      return;
    }

    if (draggingDocumentId) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const newX = Math.round(worldPos.x - documentDragOffset.x);
      const newY = Math.round(worldPos.y - documentDragOffset.y);
      onUpdateDocumentPosition(draggingDocumentId, newX, newY);
      documentDragMovedRef.current = true;
      return;
    }

    if (connectingSourceId) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      setConnectionCurrentPoint(worldPos);
    }
  };

  // Global mouse up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (draggingNodeId) {
      setDraggingNodeId(null);
    }

    if (draggingDocumentId) {
      setDraggingDocumentId(null);
    }

    if (connectingSourceId) {
      if (hoveredTargetNodeId && hoveredTargetNodeId !== connectingSourceId) {
        onCreateEdge(connectingSourceId, hoveredTargetNodeId);
      }
      setConnectingSourceId(null);
      setConnectionCurrentPoint(null);
      setHoveredTargetNodeId(null);
    }
  };

  // Node header / body drag start
  const handleNodeMouseDown = (e: React.MouseEvent, node: SonionNode) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('.prevent-drag')) return;

    onSelectNode(node.id);
    setSelectedEdgeId(null);
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setDraggingNodeId(node.id);
    setNodeDragOffset({
      x: worldPos.x - node.x,
      y: worldPos.y - node.y
    });
  };

  // Document card drag start
  const handleDocumentMouseDown = (e: React.MouseEvent, document: SonionDocument) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('.prevent-drag')) return;

    onSelectNode(null);
    onSelectDocument(document.id);
    setSelectedEdgeId(null);
    const worldPos = screenToWorld(e.clientX, e.clientY);
    documentDragMovedRef.current = false;
    setDraggingDocumentId(document.id);
    setDocumentDragOffset({
      x: worldPos.x - document.x,
      y: worldPos.y - document.y,
    });
  };

  const handleDocumentClick = (e: React.MouseEvent, documentId: string) => {
    e.stopPropagation();
    if (documentDragMovedRef.current) {
      documentDragMovedRef.current = false;
      return;
    }
    onOpenDocument(documentId);
  };

  // Connector handle drag start
  const handleConnectorMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    documentDragMovedRef.current = true;
    setConnectingSourceId(nodeId);
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setConnectionCurrentPoint(worldPos);
  };

  // Copy URL with toast
  const handleCopyUrl = async (e: React.MouseEvent, url: string, name: string) => {
    e.stopPropagation();
    const ok = await copyToClipboard(url);
    if (ok) {
      onShowToast('Link Copied', `The link for ${name} is in your clipboard.`, 'success');
    }
  };

  // Helper to get the center of any connectable entity (node or document)
  const getEntityCenter = (entityId: string) => {
    const node = nodes.find(n => n.id === entityId);
    if (node) {
      return { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT / 2 };
    }
    const document = documents.find(d => d.id === entityId);
    if (document) {
      return { x: document.x + DOC_WIDTH / 2, y: document.y + DOC_HEIGHT / 2 };
    }
    return null;
  };

  const hasSearchFilter =
    highlightedNodeIds.size > 0 || highlightedDocumentIds.size > 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-tor-bg select-none cursor-grab active:cursor-grabbing canvas-bg"
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Background Matrix / Cyber Grid Pattern */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none canvas-bg"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
          backgroundImage: `radial-gradient(circle, rgba(168, 85, 247, 0.15) 1px, transparent 1px)`
        }}
      />

      {/* SVG Container for Edges and Connection Cables */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          overflow: 'visible'
        }}
      >
        <defs>
          {/* Arrow Head Markers */}
          <marker
            id="edge-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#8b5cf6" />
          </marker>
          <marker
            id="edge-arrow-neon"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
          </marker>
          <marker
            id="edge-arrow-selected"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#ec4899" />
          </marker>
          {/* Glow Filters */}
          <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Existing Edges */}
        {edges.map(edge => {
          const sourceCenter = getEntityCenter(edge.source);
          const targetCenter = getEntityCenter(edge.target);
          if (!sourceCenter || !targetCenter) return null;
          const isSelected = selectedEdgeId === edge.id;

          // Compute midpoint for edge label or delete button
          const midX = (sourceCenter.x + targetCenter.x) / 2;
          const midY = (sourceCenter.y + targetCenter.y) / 2;

          let strokeColor = '#6366f1';
          let strokeDash = undefined;
          let marker = 'url(#edge-arrow)';

          if (edge.style === 'dashed') {
            strokeDash = '6 6';
            strokeColor = '#94a3b8';
          } else if (edge.style === 'neon') {
            strokeColor = '#06b6d4';
            marker = 'url(#edge-arrow-neon)';
          }

          if (isSelected) {
            strokeColor = '#ec4899';
            marker = 'url(#edge-arrow-selected)';
          }

          return (
            <g key={edge.id} className="pointer-events-auto cursor-pointer group">
              {/* Invisible thicker path for easier clicking */}
              <line
                x1={sourceCenter.x}
                y1={sourceCenter.y}
                x2={targetCenter.x}
                y2={targetCenter.y}
                stroke="transparent"
                strokeWidth={18}
                onClick={e => {
                  e.stopPropagation();
                  setSelectedEdgeId(edge.id);
                  onSelectNode(null);
                  onSelectDocument(null);
                }}
              />
              {/* Visible SVG Line */}
              <line
                x1={sourceCenter.x}
                y1={sourceCenter.y}
                x2={targetCenter.x}
                y2={targetCenter.y}
                stroke={strokeColor}
                strokeWidth={isSelected ? 2.5 : edge.style === 'neon' ? 2 : 1.5}
                strokeDasharray={strokeDash}
                filter={edge.style === 'neon' ? 'url(#neon-glow)' : undefined}
                markerEnd={edge.arrow !== false ? marker : undefined}
                className="transition-colors duration-150 group-hover:stroke-purple-400"
              />

              {/* Edge Label if present */}
              {edge.label && (
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x={-(edge.label.length * 4.2 + 8)}
                    y={-10}
                    width={edge.label.length * 8.4 + 16}
                    height={20}
                    rx={4}
                    fill="#111726"
                    stroke="#23304b"
                    strokeWidth={1}
                    className="opacity-90"
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={10}
                    fontFamily="monospace"
                    className="select-none pointer-events-none"
                  >
                    {edge.label}
                  </text>
                </g>
              )}

              {/* Delete Edge button when edge is selected */}
              {isSelected && (
                <g
                  transform={`translate(${midX}, ${midY + (edge.label ? 16 : 0)})`}
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteEdge(edge.id);
                    setSelectedEdgeId(null);
                  }}
                  className="cursor-pointer"
                >
                  <circle r={10} fill="#ef4444" />
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={11}
                    fontWeight="bold"
                  >
                    ×
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Temporary connection line being dragged */}
        {connectingSourceId && connectionCurrentPoint && (
          <line
            x1={getEntityCenter(connectingSourceId)?.x ?? 0}
            y1={getEntityCenter(connectingSourceId)?.y ?? 0}
            x2={connectionCurrentPoint.x}
            y2={connectionCurrentPoint.y}
            stroke="#a855f7"
            strokeWidth={2.5}
            strokeDasharray="4 4"
            className="animate-pulse"
          />
        )}
      </svg>

      {/* Nodes DOM Layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        {nodes.map(node => {
          const isSelected = selectedNodeId === node.id;
          const isHighlighted = highlightedNodeIds.has(node.id);
          const isDimmed = hasSearchFilter && !isHighlighted;
          const isConnectingSource = connectingSourceId === node.id;
          const isHoveredTarget = hoveredTargetNodeId === node.id;

          const categoryMeta = CATEGORIES[node.category] || CATEGORIES.other;
          const isTor = isOnionUrl(node.url);
          const isV3 = isV3Onion(node.url);

          return (
            <div
              key={node.id}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${NODE_WIDTH}px`,
                minHeight: `${NODE_HEIGHT}px`,
                borderColor: isSelected
                  ? '#a855f7'
                  : isHighlighted
                  ? '#06b6d4'
                  : categoryMeta.borderColor,
                backgroundColor: '#111726'
              }}
              onMouseDown={e => handleNodeMouseDown(e, node)}
              onMouseEnter={() => {
                if (connectingSourceId && connectingSourceId !== node.id) {
                  setHoveredTargetNodeId(node.id);
                }
              }}
              onMouseLeave={() => {
                if (hoveredTargetNodeId === node.id) {
                  setHoveredTargetNodeId(null);
                }
              }}
              className={`absolute rounded-xl border-2 pointer-events-auto shadow-lg backdrop-blur-md transition-[opacity,box-shadow,border-color] duration-150 ${
                isDimmed ? 'opacity-30' : 'opacity-100'
              } ${
                isSelected
                  ? 'ring-2 ring-purple-500/80 shadow-glow-purple z-30'
                  : isHighlighted
                  ? 'ring-2 ring-cyan-400/80 shadow-glow-cyan z-20 animate-pulse'
                  : isHoveredTarget
                  ? 'ring-2 ring-emerald-400 z-20 scale-105'
                  : 'hover:border-purple-400/70 hover:shadow-xl z-10'
              }`}
            >
              {/* Card Header */}
              <div
                className="flex items-center justify-between px-3 py-1.5 border-b border-tor-border/50 rounded-t-lg"
                style={{ backgroundColor: categoryMeta.bgColor }}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: categoryMeta.dotColor }}
                  />
                  <span
                    className="text-[10px] font-medium tracking-wide uppercase truncate"
                    style={{ color: categoryMeta.color }}
                  >
                    {categoryMeta.label}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Status Indicator */}
                  <span
                    title={`Status: ${node.status}`}
                    className={`w-2 h-2 rounded-full ${
                      node.status === 'online'
                        ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]'
                        : node.status === 'warning'
                        ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]'
                        : node.status === 'offline'
                        ? 'bg-rose-500'
                        : 'bg-slate-500'
                    }`}
                  />
                  {/* Has Notes Badge */}
                  {node.notes && (
                    <span title="Has notes">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-3">
                {/* Node Name / Identifier */}
                <h3 className="text-sm font-semibold text-slate-100 tracking-tight truncate mb-1">
                  {node.name || 'Unnamed'}
                </h3>

                {/* Node URL preview with Onion Badge */}
                <div className="flex items-center gap-1.5 bg-tor-bg/80 border border-tor-border/60 rounded px-2 py-1 text-xs font-mono text-slate-300">
                  <span className="truncate flex-1" title={node.url}>
                    {formatUrlDisplay(node.url, 22) || 'http://...'}
                  </span>

                  {/* Copy Button */}
                  {node.url && (
                    <button
                      onClick={e => handleCopyUrl(e, node.url, node.name)}
                      title="Copy link (for Tor Browser)"
                      className="prevent-drag p-1 text-slate-400 hover:text-purple-400 hover:bg-tor-panel rounded transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Footer tags & v3 Tor badge */}
                <div className="flex items-center justify-between mt-2 pt-1 border-t border-tor-border/30 text-[10px]">
                  <div className="flex items-center gap-1 truncate">
                    {isTor && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 font-mono font-medium">
                        {isV3 ? '.onion v3' : '.onion'}
                      </span>
                    )}
                    {node.tags && node.tags.length > 0 && (
                      <span className="text-slate-400 truncate max-w-[90px]">
                        #{node.tags[0]}
                        {node.tags.length > 1 ? ` +${node.tags.length - 1}` : ''}
                      </span>
                    )}
                  </div>

                  <span className="text-slate-500 text-[9px]">
                    ID: {node.id.slice(0, 6)}
                  </span>
                </div>
              </div>

              {/* Connection Port / Anchor Handle (Right Side) */}
              <div
                onMouseDown={e => handleConnectorMouseDown(e, node.id)}
                title="Drag to connect to a node or post"
                className={`prevent-drag absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-tor-panel border-2 border-purple-500 hover:border-cyan-400 hover:scale-125 flex items-center justify-center cursor-crosshair shadow-md transition-transform z-20 ${
                  isConnectingSource ? 'bg-purple-600 scale-125 ring-2 ring-purple-400' : ''
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-purple-400" />
              </div>
            </div>
          );
        })}

        {documents.map(document => {
          const isSelected = selectedDocumentId === document.id;
          const isHighlighted = highlightedDocumentIds.has(document.id);
          const isDimmed = hasSearchFilter && !isHighlighted;
          const isConnectingSource = connectingSourceId === document.id;
          const isHoveredTarget = hoveredTargetNodeId === document.id;
          const preview = documentPreview(document.content, 220);
          const words = wordCount(document.content);

          return (
            <div
              key={document.id}
              style={{
                left: `${document.x}px`,
                top: `${document.y}px`,
                width: `${DOC_WIDTH}px`,
                minHeight: `${DOC_HEIGHT}px`,
                borderColor: isSelected
                  ? '#a855f7'
                  : isHighlighted
                  ? '#06b6d4'
                  : '#b45309',
                backgroundColor: '#161a26',
              }}
              onMouseDown={e => handleDocumentMouseDown(e, document)}
              onClick={e => handleDocumentClick(e, document.id)}
              onMouseEnter={() => {
                if (connectingSourceId && connectingSourceId !== document.id) {
                  setHoveredTargetNodeId(document.id);
                }
              }}
              onMouseLeave={() => {
                if (hoveredTargetNodeId === document.id) {
                  setHoveredTargetNodeId(null);
                }
              }}
              className={`absolute rounded-xl border-2 pointer-events-auto shadow-lg backdrop-blur-md cursor-pointer transition-[opacity,box-shadow,border-color] duration-150 ${
                isDimmed ? 'opacity-30' : 'opacity-100'
              } ${
                isSelected
                  ? 'ring-2 ring-purple-500/80 shadow-glow-purple z-30'
                  : isHighlighted
                  ? 'ring-2 ring-cyan-400/80 shadow-glow-cyan z-20 animate-pulse'
                  : isHoveredTarget
                  ? 'ring-2 ring-emerald-400 z-20 scale-105'
                  : 'hover:border-amber-400 hover:shadow-xl z-10'
              }`}
            >
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-amber-900/50 rounded-t-lg bg-amber-950/30">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-medium tracking-wide uppercase text-amber-300">
                    Post
                  </span>
                </div>
                <span className="text-[9px] font-mono text-amber-500/70">
                  {new Date(document.updatedAt).toLocaleDateString()}
                </span>
              </div>

              <div className="p-3">
                <h3 className="text-sm font-semibold text-slate-100 tracking-tight truncate mb-1.5">
                  {document.title || 'Untitled document'}
                </h3>
                <p
                  className="text-[11px] leading-relaxed text-slate-400"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  } as React.CSSProperties}
                >
                  {preview || 'Empty post. Click to start writing.'}
                </p>
              </div>

              <div className="flex items-center justify-between px-3 pb-2 text-[9px] text-slate-500 border-t border-tor-border/30 pt-1.5">
                <span>{words} words</span>
                <span className="font-mono">ID: {document.id.slice(0, 6)}</span>
              </div>

              <div
                onMouseDown={e => handleConnectorMouseDown(e, document.id)}
                title="Drag to connect this post to a node or another post"
                className={`prevent-drag absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-tor-panel border-2 border-amber-500 hover:border-cyan-400 hover:scale-125 flex items-center justify-center cursor-crosshair shadow-md transition-transform z-20 ${
                  isConnectingSource ? 'bg-amber-600 scale-125 ring-2 ring-amber-400' : ''
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-amber-400" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Canvas Controls (Bottom-Left) */}
      <div className="absolute bottom-6 left-6 z-30 flex items-center gap-1.5 bg-tor-panel/90 backdrop-blur-md border border-tor-border p-1.5 rounded-xl shadow-xl">
        <button
          onClick={() => {
            const nextZoom = Math.min(zoom * 1.2, 2.5);
            setZoom(nextZoom);
          }}
          className="p-2 text-slate-300 hover:text-white hover:bg-tor-surface rounded-lg transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            const nextZoom = Math.max(zoom * 0.8, 0.25);
            setZoom(nextZoom);
          }}
          className="p-2 text-slate-300 hover:text-white hover:bg-tor-surface rounded-lg transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={fitToContent}
          className="p-2 text-slate-300 hover:text-white hover:bg-tor-surface rounded-lg transition-colors"
          title="Fit view to content"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 250, y: 150 });
          }}
          className="p-2 text-slate-300 hover:text-white hover:bg-tor-surface rounded-lg transition-colors"
          title="Reset View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-tor-border mx-1" />
        <span className="text-xs font-mono text-slate-400 px-2">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Helper Banner for new users on canvas */}
      <div className="absolute top-4 left-6 z-20 pointer-events-none opacity-60 hover:opacity-100 transition-opacity">
        <p className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 bg-tor-panel/80 px-2.5 py-1 rounded-md border border-tor-border/60">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          Double-click to create a node • Click a post to edit • Drag the circle to connect
        </p>
      </div>
    </div>
  );
};
