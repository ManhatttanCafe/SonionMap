import React, { useState, useEffect } from 'react';
import { SonionNode, SonionEdge, SonionDocument, NodeCategory, NodeStatus } from '../types';
import { CATEGORIES } from '../utils/categories';
import { isOnionUrl, isV3Onion, sanitizeOnionUrl, copyToClipboard } from '../utils/onion';
import {
  X,
  Copy,
  ExternalLink,
  Trash2,
  Link2,
  Save,
  Globe,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  CircleDot,
  FileText,
  Tag,
  Hash,
  Clock
} from 'lucide-react';

interface NodeInspectorProps {
  node: SonionNode;
  allNodes: SonionNode[];
  allDocuments: SonionDocument[];
  edges: SonionEdge[];
  onUpdateNode: (nodeId: string, updates: Partial<SonionNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'warning' | 'info' | 'error') => void;
  onNavigateToNode?: (nodeId: string) => void;
  onOpenDocument?: (documentId: string) => void;
}

const STATUS_OPTIONS: { value: NodeStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'online', label: 'Online', icon: <CircleDot className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
  { value: 'warning', label: 'Warning', icon: <ShieldAlert className="w-3.5 h-3.5" />, color: 'text-amber-400' },
  { value: 'offline', label: 'Offline', icon: <X className="w-3.5 h-3.5" />, color: 'text-rose-400' },
  { value: 'untested', label: 'Untested', icon: <HelpCircle className="w-3.5 h-3.5" />, color: 'text-slate-400' },
];

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  node,
  allNodes,
  allDocuments,
  edges,
  onUpdateNode,
  onDeleteNode,
  onClose,
  onShowToast,
  onNavigateToNode,
  onOpenDocument,
}) => {
  const [name, setName] = useState(node.name);
  const [url, setUrl] = useState(node.url);
  const [notes, setNotes] = useState(node.notes);
  const [category, setCategory] = useState<NodeCategory>(node.category);
  const [status, setStatus] = useState<NodeStatus>(node.status);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(node.tags || []);

  useEffect(() => {
    setName(node.name);
    setUrl(node.url);
    setNotes(node.notes);
    setCategory(node.category);
    setStatus(node.status);
    setTags(node.tags || []);
    setTagInput('');
  }, [node.id]);

  const connectedEdges = edges.filter(e => e.source === node.id || e.target === node.id);
  const connectedNodeIds = connectedEdges.map(e => (e.source === node.id ? e.target : e.source));
  const connectedNodes = connectedNodeIds
    .map(id => allNodes.find(n => n.id === id))
    .filter(Boolean) as SonionNode[];
  const connectedDocuments = connectedNodeIds
    .map(id => allDocuments.find(document => document.id === id))
    .filter(Boolean) as SonionDocument[];
  const connectedCount = connectedNodes.length + connectedDocuments.length;

  const isTor = isOnionUrl(url);
  const isV3 = isV3Onion(url);

  const handleSave = () => {
    const sanitizedUrl = sanitizeOnionUrl(url);
    onUpdateNode(node.id, {
      name: name.trim() || 'Unnamed',
      url: sanitizedUrl,
      notes,
      category,
      status,
      tags,
      updatedAt: Date.now(),
    });
    onShowToast('Node Saved', `Changes to "${name || node.name}" were saved.`, 'success');
  };

  const handleDelete = () => {
    if (window.confirm(`Delete node "${node.name}" and all its edges?`)) {
      onDeleteNode(node.id);
      onShowToast('Node Deleted', `"${node.name}" was removed from the map.`, 'warning');
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleCopyUrl = async () => {
    if (url) {
      const ok = await copyToClipboard(sanitizeOnionUrl(url));
      if (ok) {
        onShowToast('Link Copied', 'The link is in your clipboard.', 'success');
      }
    }
  };

  const handleOpenUrl = () => {
    if (url) {
      window.open(sanitizeOnionUrl(url), '_blank');
    }
  };

  return (
    <div className="w-[340px] h-full bg-tor-panel border-l border-tor-border flex flex-col animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-tor-border bg-tor-surface/50">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full border-2"
            style={{ backgroundColor: CATEGORIES[category].dotColor, borderColor: CATEGORIES[category].borderColor }}
          />
          <h2 className="text-sm font-semibold text-slate-100">Edit Node</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-tor-surface rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Identifier Name */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Hash className="w-3.5 h-3.5" />
            Identifier / Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Dread Forum, Ahmia Search..."
            className="w-full bg-tor-bg border border-tor-border rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* URL */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Globe className="w-3.5 h-3.5" />
            Link / URL
          </label>
          <div className="space-y-1.5">
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="http://xxxxx.onion"
                className="w-full bg-tor-bg border border-tor-border rounded-lg px-3 py-2 pr-20 text-xs font-mono text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500 transition-colors"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <button
                  onClick={handleCopyUrl}
                  title="Copy link"
                  className="p-1.5 text-slate-400 hover:text-purple-400 rounded transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleOpenUrl}
                  title="Open in new tab"
                  className="p-1.5 text-slate-400 hover:text-cyan-400 rounded transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Onion detection badge */}
            {isTor && (
              <div className="flex items-center gap-1.5 text-[11px]">
                {isV3 ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 font-mono">
                    <ShieldCheck className="w-3 h-3" />
                    Onion v3 detected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-mono">
                    <ShieldAlert className="w-3 h-3" />
                    Onion (check version)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Tag className="w-3.5 h-3.5" />
            Category
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(CATEGORIES) as NodeCategory[]).map(catKey => {
              const cat = CATEGORIES[catKey];
              const isSelected = category === catKey;
              return (
                <button
                  key={catKey}
                  onClick={() => setCategory(catKey)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                    isSelected
                      ? 'border-current shadow-md'
                      : 'border-tor-border text-slate-400 hover:border-slate-500'
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: cat.bgColor, color: cat.color, borderColor: cat.borderColor }
                      : undefined
                  }
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.dotColor }} />
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <CircleDot className="w-3.5 h-3.5" />
            Site status
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                  status === opt.value
                    ? 'border-tor-border bg-tor-surface text-slate-100'
                    : 'border-tor-border text-slate-500 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className={status === opt.value ? opt.color : ''}>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Tag className="w-3.5 h-3.5" />
            Tags
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map(tag => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-0.5 bg-tor-surface border border-tor-border rounded-full text-[11px] text-slate-300 font-mono"
              >
                #{tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add tag..."
              className="flex-1 bg-tor-bg border border-tor-border rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500 transition-colors"
            />
            <button
              onClick={handleAddTag}
              className="px-3 py-1.5 bg-tor-surface border border-tor-border rounded-lg text-xs text-slate-300 hover:text-white hover:border-purple-500 transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <FileText className="w-3.5 h-3.5" />
            Notes / Extra Information
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Description, security warnings, PGP keys, notes..."
            rows={6}
            className="w-full bg-tor-bg border border-tor-border rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500 transition-colors resize-y leading-relaxed"
          />
        </div>

        {/* Timestamps */}
        <div className="text-[10px] text-slate-600 font-mono space-y-0.5 pt-2 border-t border-tor-border/50">
          <p className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Created: {new Date(node.createdAt).toLocaleString('en')}
          </p>
          <p className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Updated: {new Date(node.updatedAt).toLocaleString('en')}
          </p>
        </div>

        {/* Connected Entities */}
        {connectedCount > 0 && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
              <Link2 className="w-3.5 h-3.5" />
              Connected ({connectedCount})
            </label>
            <div className="space-y-1">
              {connectedNodes.map(cn => {
                const edge = connectedEdges.find(
                  e => (e.source === node.id && e.target === cn.id) || (e.target === node.id && e.source === cn.id)
                );
                return (
                  <button
                    key={cn.id}
                    onClick={() => onNavigateToNode?.(cn.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-tor-bg border border-tor-border rounded-lg text-left hover:border-purple-500 transition-colors group"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORIES[cn.category].dotColor }}
                    />
                    <span className="flex-1 text-xs text-slate-300 group-hover:text-white truncate">
                      {cn.name}
                    </span>
                    {edge?.label && (
                      <span className="text-[9px] text-slate-500 font-mono shrink-0">{edge.label}</span>
                    )}
                  </button>
                );
              })}
              {connectedDocuments.map(document => {
                const edge = connectedEdges.find(
                  e =>
                    (e.source === node.id && e.target === document.id) ||
                    (e.target === node.id && e.source === document.id)
                );
                return (
                  <button
                    key={document.id}
                    onClick={() => onOpenDocument?.(document.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-amber-950/20 border border-amber-900/50 rounded-lg text-left hover:border-amber-500 transition-colors group"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="flex-1 text-xs text-slate-300 group-hover:text-white truncate">
                      {document.title}
                    </span>
                    {edge?.label && (
                      <span className="text-[9px] text-slate-500 font-mono shrink-0">{edge.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-tor-border flex gap-2 bg-tor-surface/30">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-glow-purple"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
        <button
          onClick={handleDelete}
          title="Delete node"
          className="px-3 py-2.5 bg-rose-950/60 hover:bg-rose-800/80 text-rose-300 hover:text-white border border-rose-800/60 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
