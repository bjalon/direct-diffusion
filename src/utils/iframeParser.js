/**
 * Parse a Facebook video iframe embed code and extract the relevant metadata.
 * @param {string} htmlCode - Raw HTML containing an <iframe> tag
 * @returns {{ src: string, videoUrl: string, originalWidth: number, originalHeight: number } | null}
 */
export function parseIframe(htmlCode) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlCode.trim(), 'text/html');
  const iframe = doc.querySelector('iframe');
  if (!iframe) return null;

  const src = iframe.getAttribute('src');
  if (!src) return null;

  try {
    const url = new URL(src);
    const videoUrl = url.searchParams.get('href') || src;
    const originalWidth = parseInt(iframe.getAttribute('width') || '560', 10);
    const originalHeight = parseInt(iframe.getAttribute('height') || '315', 10);

    const orientation = originalHeight > originalWidth ? 'portrait' : 'landscape';

    return {
      src,
      videoUrl,
      originalWidth,
      originalHeight,
      orientation,
    };
  } catch {
    return null;
  }
}

/**
 * Rebuild a Facebook plugin video URL with new width/height dimensions.
 */
export function buildFbSrc(originalSrc, width, height) {
  try {
    const url = new URL(originalSrc);
    url.searchParams.set('width', Math.round(width));
    url.searchParams.set('height', Math.round(height));
    url.searchParams.set('show_text', 'false');
    return url.toString();
  } catch {
    return originalSrc;
  }
}
