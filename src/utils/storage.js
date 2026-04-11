export const LAYOUTS = {
  '1':   { label: '1 flux',          cols: 1, rows: 1, slots: 1 },
  '1x2': { label: '2 côte à côte',   cols: 2, rows: 1, slots: 2 },
  '2x1': { label: '2 empilés',       cols: 1, rows: 2, slots: 2 },
  '2x2': { label: '4 flux (2×2)',    cols: 2, rows: 2, slots: 4 },
  '3x2': { label: '6 flux (3×2)',    cols: 3, rows: 2, slots: 6 },
  '3x3': { label: '9 flux (3×3)',    cols: 3, rows: 3, slots: 9 },
};

const STORAGE_KEY = 'direct-diffusion-config';

/** Default config: layout from .env, no streams (streams come from streams.json). */
function buildEnvDefault() {
  const layout = import.meta.env.VITE_DEFAULT_LAYOUT || '1';
  const resolvedLayout = LAYOUTS[layout] ? layout : '1';
  return { layout: resolvedLayout, slots: {}, streams: [] };
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildEnvDefault();
    const saved = JSON.parse(raw);
    return { layout: '1', slots: {}, streams: [], ...saved };
  } catch {
    return buildEnvDefault();
  }
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** True if a config has already been saved in this browser. */
export function hasSavedConfig() {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
