export const LAYOUTS = {
  '1':   { label: '1 flux',          cols: 1, rows: 1, slots: 1 },
  '1x2': { label: '2 côte à côte',   cols: 2, rows: 1, slots: 2 },
  '2x1': { label: '2 empilés',       cols: 1, rows: 2, slots: 2 },
  '2x2': { label: '4 flux (2×2)',    cols: 2, rows: 2, slots: 4 },
  '3x2': { label: '6 flux (3×2)',    cols: 3, rows: 2, slots: 6 },
  '3x3': { label: '9 flux (3×3)',    cols: 3, rows: 3, slots: 9 },
};

const STORAGE_KEY = 'direct-diffusion-config';

/**
 * Build the factory-default config from environment variables (set in .env).
 * If VITE_DEFAULT_STREAM_SRC is defined, the stream is created and assigned
 * to every slot of the default layout.
 */
function buildEnvDefault() {
  const layout     = import.meta.env.VITE_DEFAULT_LAYOUT       || '1';
  const src        = import.meta.env.VITE_DEFAULT_STREAM_SRC   || '';
  const videoUrl   = import.meta.env.VITE_DEFAULT_STREAM_URL   || '';
  const label      = import.meta.env.VITE_DEFAULT_STREAM_LABEL || 'Flux principal';
  const orientation = import.meta.env.VITE_DEFAULT_STREAM_ORIENTATION || 'landscape';

  const layoutConfig = LAYOUTS[layout] ?? LAYOUTS['1'];
  const resolvedLayout = LAYOUTS[layout] ? layout : '1';

  if (!src) {
    return { layout: resolvedLayout, slots: {}, streams: [] };
  }

  // Extract the original iframe dimensions from the FB plugin URL params.
  let originalWidth = 560;
  let originalHeight = 315;
  try {
    const url = new URL(src);
    const w = parseInt(url.searchParams.get('width')  || '0', 10);
    const h = parseInt(url.searchParams.get('height') || '0', 10);
    if (w > 0 && h > 0) { originalWidth = w; originalHeight = h; }
  } catch { /* keep defaults */ }

  const id = 'env-default';
  const slots = {};
  for (let i = 0; i < layoutConfig.slots; i++) {
    slots[i] = id;
  }

  return {
    layout: resolvedLayout,
    slots,
    streams: [{ id, label, src, videoUrl, orientation, originalWidth, originalHeight }],
  };
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildEnvDefault();
    const saved = JSON.parse(raw);
    // Merge with a minimal fallback so old saved configs stay valid
    return { layout: '1', slots: {}, streams: [], ...saved };
  } catch {
    return buildEnvDefault();
  }
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
