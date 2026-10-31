import React from 'react';
import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MapImage } from '../types';

interface MarkdownViewProps {
  content: string;
  images: MapImage[];
  emptyMessage?: string;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold text-slate-100 mt-5 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-bold text-slate-100 mt-5 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-slate-100 mt-4 mb-1.5 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-semibold text-slate-200 mt-3 mb-1 first:mt-0">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-slate-300 my-2 first:mt-0 last:mb-0">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-cyan-400 underline decoration-cyan-500/40 hover:text-cyan-300 hover:decoration-cyan-300 transition-colors"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
  del: ({ children }) => <del className="text-slate-500 line-through">{children}</del>,
  ul: ({ children }) => (
    <ul className="list-disc list-inside space-y-1 my-2 text-sm text-slate-300">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside space-y-1 my-2 text-sm text-slate-300">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed [&>p]:my-0">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-purple-500/70 pl-3 my-3 text-slate-400 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-tor-border" />,
  code: ({ className, children, ...props }) => {
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    if (isBlock) {
      return (
        <code
          className={`block overflow-x-auto rounded-lg border border-tor-border bg-tor-bg p-3 text-xs font-mono text-cyan-200 ${className ?? ''}`}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-tor-bg border border-tor-border/70 px-1 py-0.5 text-[0.85em] font-mono text-cyan-200"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-3">{children}</pre>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs text-slate-300">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-tor-border bg-tor-surface px-2 py-1 text-left font-semibold text-slate-200">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-tor-border px-2 py-1">{children}</td>,
};

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  images,
  emptyMessage = 'This post is empty. Start writing in the editor.',
}) => {
  if (!content.trim()) {
    return <p className="text-sm text-slate-500 italic">{emptyMessage}</p>;
  }

  const imageById = new Map(images.map(image => [image.id, image]));

  const imageComponent: Components['img'] = ({ src, alt }) => {
    const value = typeof src === 'string' ? src : '';
    if (value.startsWith('sonion-image:')) {
      const found = imageById.get(value.slice('sonion-image:'.length));
      if (!found) {
        return (
          <span className="inline-flex items-center rounded border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-xs text-amber-300">
            Missing image: {alt || 'unnamed'}
          </span>
        );
      }
      return (
        <img
          src={found.dataUrl}
          alt={alt || found.name}
          className="max-w-full rounded-xl border border-tor-border my-3 shadow-lg"
          loading="lazy"
        />
      );
    }

    return (
      <img
        src={value}
        alt={alt || ''}
        className="max-w-full rounded-xl border border-tor-border my-3 shadow-lg"
        loading="lazy"
      />
    );
  };

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ ...components, img: imageComponent }}
        urlTransform={url =>
          url.startsWith('sonion-image:') ? url : defaultUrlTransform(url)
        }
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
