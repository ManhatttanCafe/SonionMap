const MAX_IMAGE_SIDE = 1600;
const OPTIMIZE_THRESHOLD = 900_000;

export interface PreparedImage {
  name: string;
  mimeType: string;
  dataUrl: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode the image.'));
    image.src = src;
  });
}

export async function prepareImageFile(file: File): Promise<PreparedImage | null> {
  if (!file.type.startsWith('image/')) return null;

  const original = await readAsDataUrl(file);
  const compressible =
    file.size > OPTIMIZE_THRESHOLD &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);

  if (!compressible) {
    return { name: file.name, mimeType: file.type, dataUrl: original };
  }

  try {
    const image = await loadImage(original);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return { name: file.name, mimeType: file.type, dataUrl: original };

    context.drawImage(image, 0, 0, width, height);
    const compressed = canvas.toDataURL('image/webp', 0.82);
    if (!compressed.startsWith('data:image/webp')) {
      return { name: file.name, mimeType: file.type, dataUrl: original };
    }
    return { name: file.name, mimeType: 'image/webp', dataUrl: compressed };
  } catch {
    return { name: file.name, mimeType: file.type, dataUrl: original };
  }
}
