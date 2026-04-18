function isFacebookHost(hostname) {
  return /(^|\.)facebook\.com$/i.test(hostname);
}

function isYouTubeHost(hostname) {
  return /(^|\.)youtube\.com$/i.test(hostname)
    || /(^|\.)youtube-nocookie\.com$/i.test(hostname)
    || hostname === 'youtu.be';
}

function extractYouTubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (!isYouTubeHost(host)) {
      return null;
    }

    if (url.pathname === '/watch') {
      return url.searchParams.get('v');
    }

    const pathSegments = url.pathname.split('/').filter(Boolean);
    if (pathSegments[0] === 'embed' || pathSegments[0] === 'shorts' || pathSegments[0] === 'live') {
      return pathSegments[1] || null;
    }

    return null;
  } catch {
    return null;
  }
}

function canonicalYouTubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function normalizeFacebookOnlyEmbedSrc(src) {
  try {
    const url = new URL(src);
    const isEmbeddedVideoPath = url.pathname === '/plugins/video.php' || url.pathname === '/video/embed';

    if (!isFacebookHost(url.hostname) || !isEmbeddedVideoPath) {
      return src;
    }

    url.searchParams.set('autoplay', 'true');
    url.searchParams.set('loop', 'true');
    return url.toString();
  } catch {
    return src;
  }
}

export function buildYouTubeEmbedSrc(videoUrl) {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) {
    return videoUrl;
  }

  const params = new URLSearchParams({
    autoplay: '1',
    loop: '1',
    playlist: videoId,
    playsinline: '1',
    rel: '0',
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function normalizeYouTubeEmbedSrc(src) {
  const videoId = extractYouTubeVideoId(src);
  if (!videoId) {
    return src;
  }

  return buildYouTubeEmbedSrc(src);
}

export function normalizeEmbedSrc(src) {
  return normalizeYouTubeEmbedSrc(normalizeFacebookOnlyEmbedSrc(src));
}

/**
 * Kept for compatibility with existing imports.
 * This now normalizes both Facebook and YouTube embed sources.
 */
export function normalizeFacebookEmbedSrc(src) {
  return normalizeEmbedSrc(src);
}

/**
 * Parse a video iframe embed code and extract the relevant metadata.
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
    const youtubeVideoId = extractYouTubeVideoId(src);
    const videoUrl = youtubeVideoId
      ? canonicalYouTubeWatchUrl(youtubeVideoId)
      : (url.searchParams.get('href') || src);
    const originalWidth = parseInt(iframe.getAttribute('width') || '560', 10);
    const originalHeight = parseInt(iframe.getAttribute('height') || '315', 10);
    const orientation = originalHeight > originalWidth ? 'portrait' : 'landscape';

    return {
      src: normalizeEmbedSrc(src),
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
 * Build an embed src from a supported video URL.
 * Supports Facebook video URLs and YouTube video URLs.
 */
export function buildSrcFromUrl(videoUrl, width = 267, height = 476) {
  const youtubeVideoId = extractYouTubeVideoId(videoUrl);
  if (youtubeVideoId) {
    return buildYouTubeEmbedSrc(videoUrl);
  }

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
 * Accept either a supported video URL or a full <iframe> embed code.
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

  if (extractYouTubeVideoId(trimmed)) {
    return {
      src: buildSrcFromUrl(trimmed),
      videoUrl: trimmed,
      originalWidth: 560,
      originalHeight: 315,
      orientation: 'landscape',
    };
  }

  return parseIframe(trimmed);
}
