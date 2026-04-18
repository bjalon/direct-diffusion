/**
 * Parse a Facebook video iframe embed code and extract the relevant metadata.
 * @param {string} htmlCode - Raw HTML containing an <iframe> tag
 * @returns {{ src: string, videoUrl: string, originalWidth: number, originalHeight: number } | null}
 */
export function normalizeFacebookEmbedSrc(src) {
  try {
    const url = new URL(src);
    const isFacebookHost = /(^|\.)facebook\.com$/i.test(url.hostname);
    const isEmbeddedVideoPath = url.pathname === '/plugins/video.php' || url.pathname === '/video/embed';

    if (!isFacebookHost || !isEmbeddedVideoPath) {
      return src;
    }

    url.searchParams.set('autoplay', 'true');
    url.searchParams.set('loop', 'true');
    return url.toString();
  } catch {
    return src;
  }
}

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
      src: normalizeFacebookEmbedSrc(src),
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
 * Build a Facebook plugin embed src from a plain Facebook video page URL.
 * e.g. https://www.facebook.com/123/videos/456/
 *   → https://www.facebook.com/plugins/video.php?href=...&show_text=false&width=W&height=H
 */
export function buildSrcFromUrl(videoUrl, width = 267, height = 476) {
  const params = new URLSearchParams({
    href: videoUrl,
    autoplay: 'true',
    loop: 'true',
    show_text: 'false',
    width: String(width),
    height: String(height),
    t: '0',
  });
  return `https://www.facebook.com/plugins/video.php?${params.toString()}`;
}

/**
 * Accept either a plain Facebook video URL or a full <iframe> embed code.
 * Returns the same shape as parseIframe, or null if unrecognised.
 */
export function parseInput(input) {
  const trimmed = input.trim();
  if (/https?:\/\/(www\.)?facebook\.com\/.+\/videos\//.test(trimmed)) {
    return {
      src: buildSrcFromUrl(trimmed),
      videoUrl: trimmed,
      originalWidth: 267,
      originalHeight: 476,
      orientation: 'portrait',
    };
  }
  return parseIframe(trimmed);
}
