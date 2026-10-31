import React, { useState } from 'react';
import { MapData } from '../types';
import {
  X,
  Plus,
  Copy,
  Trash2,
  Download,
  Upload,
  Map as MapIcon,
  FolderOpen,
  Check
} from 'lucide-react';

interface MapManagerModalProps {
  isOpen: boolean;
  maps: MapData[];
  activeMapId: string;
  onClose: () => void;
  onSelectMap: (id: string) => void;
  onCreateMap: (name: string, description: string) => void;
  onDuplicateMap: (id: string) => void;
  onDeleteMap: (id: string) => void;
  onExportMap: (id: string) => void;
  onImportJson: (file: File) => void;
}

export const MapManagerModal: React.FC<MapManagerModalProps> = ({
  isOpen,
  maps,
  activeMapId,
  onClose,
  onSelectMap,
  onCreateMap,
  onDuplicateMap,
  onDeleteMap,
  onExportMap,
  onImportJson,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapDesc, setNewMapDesc] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (newMapName.trim()) {
      onCreateMap(newMapName.trim(), newMapDesc.trim());
      setNewMapName('');
      newMapDesc.trim();
      setNewMapDesc('');
      setShowCreateForm(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.sonionmap';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        onImportJson(file);
      }
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-tor-panel border border-tor-border rounded-2xl w-full max-w-lg mx-4 shadow-2xl animate-scale-in overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tor-border bg-tor-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Map Manager</h2>
              <p className="text-xs text-slate-500">{maps.length} map{maps.length !== 1 ? 's' : ''} in your database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-tor-surface rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {maps.length === 0 && (
            <div className="py-10 text-center">
              <MapIcon className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No maps yet</p>
              <p className="text-xs text-slate-600 mt-1">Create your first map to get started.</p>
            </div>
          )}
          {maps.map(map => {
            const isActive = map.id === activeMapId;
            return (
              <div
                key={map.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isActive
                    ? 'border-purple-500/60 bg-purple-950/20 shadow-glow-purple'
                    : 'border-tor-border bg-tor-surface/30 hover:border-slate-600'
                }`}
              >
                <button
                  onClick={() => {
                    onSelectMap(map.id);
                    onClose();
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <MapIcon className={`w-4 h-4 shrink-0 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
                    <span className="text-sm font-semibold text-slate-200 truncate">{map.name}</span>
                    {isActive && (
                      <span className="flex items-center gap-0.5 text-[10px] text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded-full border border-purple-800/60 shrink-0">
                        <Check className="w-2.5 h-2.5" /> Active
                      </span>
                    )}
                  </div>
                  {map.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate ml-6">{map.description}</p>
                  )}
                  <p className="text-[10px] text-slate-600 font-mono mt-1 ml-6">
                    {map.nodes.length} node{map.nodes.length !== 1 ? 's' : ''} · {map.edges.length} edge{map.edges.length !== 1 ? 's' : ''}
                  </p>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onExportMap(map.id)}
                    title="Export this map"
                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-tor-surface rounded transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDuplicateMap(map.id)}
                    title="Duplicate map"
                    className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-tor-surface rounded transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete map "${map.name}"? This action cannot be undone.`)) {
                        onDeleteMap(map.id);
                      }
                    }}
                    title="Delete map"
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-tor-surface rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Create Form or Actions */}
        <div className="p-4 border-t border-tor-border bg-tor-surface/30">
          {showCreateForm ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newMapName}
                onChange={e => setNewMapName(e.target.value)}
                placeholder="New map name..."
                className="w-full bg-tor-bg border border-tor-border rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-purple-500"
                autoFocus
              />
              <input
                type="text"
                value={newMapDesc}
                onChange={e => setNewMapDesc(e.target.value)}
                placeholder="Description (optional)..."
                className="w-full bg-tor-bg border border-tor-border rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-purple-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newMapName.trim()}
                  className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Create Map
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-2 bg-tor-surface border border-tor-border text-slate-300 hover:text-white rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors shadow-glow-purple"
              >
                <Plus className="w-4 h-4" />
                New Map
              </button>
              <button
                onClick={handleImport}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-tor-surface border border-tor-border text-slate-300 hover:text-white hover:border-cyan-500 text-sm font-medium rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import JSON
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
