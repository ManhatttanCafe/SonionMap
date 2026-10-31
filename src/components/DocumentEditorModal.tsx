import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Save,
  Trash2,
  Bold,
  Italic,
  Heading2,
  List,
  Link2,
  Image as ImageIcon,
  Code2,
  Quote,
  Eye,
  Pencil,
  FileText,
  Loader2,
} from 'lucide-react';
import { MapImage, SonionDocument } from '../types';
import { MarkdownView } from './MarkdownView';
import { documentPreview, imageMarkdown, wordCount } from '../utils/markdown';

interface DocumentEditorModalProps {
  document: SonionDocument;
  images: MapImage[];
  onSave: (documentId: string, updates: { title: string; content: string }) => void;
  onDelete: (documentId: string) => void;
  onClose: () => void;
  onAddImage: (file: File) => Promise<MapImage | null>;
  onShowToast: (title: string, message?: string, type?: 'success' | 'warning' | 'info' | 'error') => void;
}

export const DocumentEditorModal: React.FC<DocumentEditorModalProps> = ({
  document,
  images,
  onSave,
  onDelete,
  onClose,
  onAddImage,
  onShowToast,
}) => {
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(document.title);
    setContent(document.content);
    setMobileTab('edit');
  }, [document.id]);

  const dirty = title !== document.title || content !== document.content;
  const words = useMemo(() => wordCount(content), [content]);
  const preview = useMemo(() => documentPreview(content, 120), [content]);

  const rememberSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return null;
    return { start: textarea.selectionStart, end: textarea.selectionEnd };
  };

  const restoreSelection = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  };

  const insertText = (text: string, selectOffset?: { start: number; end: number }) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent(previous => previous + text);
      return;
    }
    const { selectionStart, selectionEnd } = textarea;
    const next = content.slice(0, selectionStart) + text + content.slice(selectionEnd);
    setContent(next);
    const cursorStart = selectionStart + (selectOffset?.start ?? text.length);
    const cursorEnd = selectionStart + (selectOffset?.end ?? text.length);
    restoreSelection(cursorStart, cursorEnd);
  };

  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    const selected = content.slice(selectionStart, selectionEnd) || placeholder;
    const inserted = `${before}${selected}${after}`;
    const next = content.slice(0, selectionStart) + inserted + content.slice(selectionEnd);
    setContent(next);
    restoreSelection(
      selectionStart + before.length,
      selectionStart + before.length + selected.length
    );
  };

  const toggleLinePrefix = (prefix: string) => {
    const selection = rememberSelection();
    if (!selection) return;
    const lineStart = content.lastIndexOf('\n', selection.start - 1) + 1;
    const lineEnd = content.indexOf('\n', selection.end);
    const end = lineEnd === -1 ? content.length : lineEnd;
    const block = content.slice(lineStart, end);
    const alreadyPrefixed = block
      .split('\n')
      .every(line => line.startsWith(prefix) || line.trim() === '');
    const updated = block
      .split('\n')
      .map(line => {
        if (!line.trim()) return line;
        return alreadyPrefixed ? line.slice(prefix.length) : `${prefix}${line}`;
      })
      .join('\n');
    const next = content.slice(0, lineStart) + updated + content.slice(end);
    setContent(next);
    restoreSelection(lineStart, lineStart + updated.length);
  };

  const addImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onShowToast('Invalid file', 'Only image files can be attached to a post.', 'warning');
      return;
    }
    setIsUploading(true);
    try {
      const image = await onAddImage(file);
      if (!image) {
        onShowToast('Image not added', 'The image could not be processed.', 'error');
        return;
      }
      insertText(`\n${imageMarkdown(image.name, image.id)}\n`);
      onShowToast('Image added', `"${image.name}" was saved inside this map.`, 'success');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await addImageFile(file);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFile = [...event.clipboardData.items]
      .find(item => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile();
    if (imageFile) {
      event.preventDefault();
      await addImageFile(imageFile);
    }
  };

  const handleSave = () => {
    onSave(document.id, {
      title: title.trim() || 'Untitled document',
      content,
    });
  };

  const handleDelete = () => {
    if (window.confirm(`Delete the post "${document.title}" and all its connections?`)) {
      onDelete(document.id);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      handleSave();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in p-3 md:p-6"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-tor-panel border border-tor-border rounded-2xl w-full max-w-6xl h-full max-h-[92vh] shadow-2xl animate-scale-in overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-tor-border bg-tor-surface/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="Post title..."
                className="w-full bg-transparent text-lg font-bold text-slate-100 placeholder-slate-600 outline-none border-b border-transparent focus:border-purple-500 pb-0.5"
              />
              <p className="text-[11px] text-slate-500 truncate">
                {preview || 'Markdown post'} · {words} words
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              title="Close without saving"
              className="p-2 text-slate-400 hover:text-white hover:bg-tor-surface rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 px-4 py-2 border-b border-tor-border bg-tor-bg/40 overflow-x-auto">
          <ToolbarButton title="Bold" onClick={() => wrapSelection('**', '**', 'bold text')}>
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Italic" onClick={() => wrapSelection('*', '*', 'italic text')}>
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Heading" onClick={() => toggleLinePrefix('## ')}>
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Bullet list" onClick={() => toggleLinePrefix('- ')}>
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Quote" onClick={() => toggleLinePrefix('> ')}>
            <Quote className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Inline code"
            onClick={() => wrapSelection('`', '`', 'code')}
          >
            <Code2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Link"
            onClick={() => wrapSelection('[', '](https://)', 'link text')}
          >
            <Link2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Insert image"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
          </ToolbarButton>

          <div className="h-5 w-px bg-tor-border mx-1" />

          <div className="flex md:hidden items-center gap-1">
            <ToolbarButton
              title="Editor"
              active={mobileTab === 'edit'}
              onClick={() => setMobileTab('edit')}
            >
              <Pencil className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Preview"
              active={mobileTab === 'preview'}
              onClick={() => setMobileTab('preview')}
            >
              <Eye className="w-4 h-4" />
            </ToolbarButton>
          </div>

          <span className="ml-auto text-[10px] font-mono text-slate-500 hidden sm:block">
            Markdown · Ctrl+S to save
          </span>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div
            className={`${mobileTab === 'edit' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0 border-r border-tor-border`}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={event => setContent(event.target.value)}
              onPaste={handlePaste}
              placeholder="Write your post... You can use Markdown for headings, lists, links, code, and images."
              className="flex-1 w-full bg-tor-bg p-4 md:p-5 text-sm leading-relaxed text-slate-200 placeholder-slate-600 outline-none resize-none font-mono"
              spellCheck
            />
          </div>

          <div
            className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0 bg-tor-bg/40`}
          >
            <div className="px-4 py-2 border-b border-tor-border text-[10px] uppercase tracking-wider text-slate-500 font-mono">
              Preview
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <MarkdownView content={content} images={images} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-t border-tor-border bg-tor-surface/30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleDelete}
              title="Delete post"
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/60 hover:bg-rose-800/80 text-rose-300 hover:text-white border border-rose-800/60 rounded-lg text-xs transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
            <span className="text-[11px] text-slate-500 truncate">
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-2 bg-tor-surface border border-tor-border text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-glow-purple"
            >
              <Save className="w-4 h-4" />
              Save Post
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};

const ToolbarButton: React.FC<{
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}> = ({ title, onClick, children, disabled, active }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
      active
        ? 'bg-purple-600 text-white'
        : 'text-slate-400 hover:text-white hover:bg-tor-surface'
    }`}
  >
    {children}
  </button>
);
