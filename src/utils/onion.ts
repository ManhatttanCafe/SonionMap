export function isOnionUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  return clean.includes('.onion');
}

export function isV3Onion(url: string): boolean {
  if (!url) return false;
  // Match [a-z2-7]{56}.onion pattern
  const v3Regex = /[a-z2-7]{56}\.onion/i;
  return v3Regex.test(url.trim());
}

export function formatUrlDisplay(url: string, maxLength: number = 32): string {
  if (!url) return '';
  let clean = url.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  if (clean.length <= maxLength) return clean;
  
  if (clean.includes('.onion')) {
    const parts = clean.split('.onion');
    const domain = parts[0];
    const path = parts.slice(1).join('.onion');
    if (domain.length > 18) {
      const shortDomain = `${domain.slice(0, 10)}...${domain.slice(-6)}.onion`;
      return path ? `${shortDomain}${path.slice(0, 10)}...` : shortDomain;
    }
  }

  return `${clean.slice(0, maxLength - 3)}...`;
}

export function sanitizeOnionUrl(url: string): string {
  let clean = url.trim();
  if (!clean) return '';
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    // Tor onion services almost universally run on http unless an onion certificate is configured
    clean = `http://${clean}`;
  }
  return clean;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    }
  } catch (err) {
    console.error('Error copying to clipboard:', err);
    return false;
  }
}
