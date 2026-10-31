const IMAGE_REFERENCE = /sonion-image:([A-Za-z0-9._-]+)/g;

export function extractImageIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(IMAGE_REFERENCE)) {
    ids.add(match[1]);
  }
  return [...ids];
}

export function documentPreview(content: string, maxLength = 220): string {
  const plain = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}...`;
}

export function imageMarkdown(name: string, imageId: string): string {
  const safeName = name.replace(/[[\]]/g, '').trim() || 'image';
  return `![${safeName}](sonion-image:${imageId})`;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
