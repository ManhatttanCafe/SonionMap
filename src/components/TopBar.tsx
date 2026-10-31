import React, { useRef } from 'react';
import {
  Search,
  Plus,
  Zap,
  Download,
  Upload,
  FolderOpen,
  Globe,
  Network,
  X,
  RefreshCw,
  FileText,
  Map as MapIcon
} from 'lucide-react';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeMapName: string;
  maps: { id: string; name: string }[];
  activeMapId: string;
  onSelectMap: (id: string) => void;
  onAddNode: () => void;
  onAddDocument: () => void;
  onAutoLayout: () => void;
  onSyncServer: () => void;
  isSyncing?: boolean;
  onExportActiveMap: () => void;
  onExportAll: () => void;
  onImportJson: (file: File) => void;
  onOpenMapManager: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  activeMapName,
  maps,
  activeMapId,
  onSelectMap,
  onAddNode,
  onAddDocument,
  onAutoLayout,
  onSyncServer,
  isSyncing = false,
  onExportActiveMap,
  onExportAll,
  onImportJson,
  onOpenMapManager,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasActiveMap = maps.some(map => map.id === activeMapId);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
      e.target.value = '';
    }
  };

  return (
    <div className="h-14 bg-tor-panel/95 backdrop-blur-md border-b border-tor-border flex items-center px-4 gap-3 z-40 relative">
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-glow-purple">
          <Network className="w-5 h-5 text-white" />
        </div>
        <div className="hidden md:block">
          <h1 className="text-sm font-bold tracking-tight text-slate-100 leading-none">
            Sonion<span className="text-purple-400">Maper</span>
          </h1>
          <p className="text-[9px] text-slate-500 font-mono tracking-wider">DARKNET CARTOGRAPHY</p>
        </div>
      </div>

      <div className="h-6 w-px bg-tor-border shrink-0" />

      {/* Map Selector */}
      <div className="flex items-center gap-1.5 shrink-0">
        <MapIcon className="w-4 h-4 text-slate-500" />
        <select
          value={activeMapId}
          onChange={e => onSelectMap(e.target.value)}
          disabled={maps.length === 0}
          className="bg-tor-surface border border-tor-border text-xs text-slate-200 rounded-lg px-2.5 py-1.5 pr-6 outline-none focus:border-purple-500 cursor-pointer appearance-none min-w-[120px] max-w-[180px] truncate disabled:opacity-50 disabled:cursor-not-allowed"
          title={hasActiveMap ? `Active map: ${activeMapName}` : 'No map selected'}
        >
          {maps.length === 0 && (
            <option value="">No maps</option>
          )}
          {maps.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          onClick={onOpenMapManager}
          title="Manage maps"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-tor-surface rounded-lg transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex-1 max-w-md mx-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search nodes, posts, links, or tags..."
          className="w-full bg-tor-surface border border-tor-border rounded-xl pl-9 pr-8 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40 transition-all font-mono"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-white rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onAddNode}
          disabled={!hasActiveMap}
          title={hasActiveMap ? 'Create new node' : 'Create a map first'}
          className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors shadow-glow-purple"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden lg:inline">New Node</span>
        </button>

        <button
          onClick={onAddDocument}
          disabled={!hasActiveMap}
          title={hasActiveMap ? 'Create a new post/document' : 'Create a map first'}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden lg:inline">New Post</span>
        </button>

        <button
          onClick={onAutoLayout}
          disabled={!hasActiveMap}
          title={hasActiveMap ? 'Auto-organize the graph (physics)' : 'Create a map first'}
          className="p-2 text-slate-400 hover:text-white hover:bg-tor-surface rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Zap className="w-4 h-4" />
        </button>

        <button
          onClick={onSyncServer}
          disabled={isSyncing}
          title="Sync maps from the server (MCP/API)"
          className="p-2 text-slate-400 hover:text-purple-300 hover:bg-tor-surface rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>

        <div className="h-5 w-px bg-tor-border mx-0.5" />

        <button
          onClick={onExportActiveMap}
          disabled={!hasActiveMap}
          title={hasActiveMap ? 'Export active map (JSON)' : 'Create a map first'}
          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-tor-surface rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={onExportAll}
          disabled={maps.length === 0}
          title={maps.length > 0 ? 'Export all maps (backup)' : 'There are no maps to export'}
          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-tor-surface rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Globe className="w-4 h-4" />
        </button>

        <button
          onClick={handleImportClick}
          title="Import map from JSON file"
          className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-tor-surface rounded-lg transition-colors"
        >
          <Upload className="w-4 h-4" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.sonionmap"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};
