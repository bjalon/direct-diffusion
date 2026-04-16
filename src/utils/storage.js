export const LAYOUTS = {
  '1':   { label: '1 flux',          cols: 1, rows: 1, slots: 1 },
  '1x2': { label: '2 côte à côte',   cols: 2, rows: 1, slots: 2 },
  '2x1': { label: '2 empilés',       cols: 1, rows: 2, slots: 2 },
  '2x2': { label: '4 flux (2×2)',    cols: 2, rows: 2, slots: 4 },
  '3x2': { label: '6 flux (3×2)',    cols: 3, rows: 2, slots: 6 },
  '3x3': { label: '9 flux (3×3)',    cols: 3, rows: 3, slots: 9 },
};

const STORAGE_KEY = 'direct-diffusion-config';

/** Default layout+slots from .env. Streams come from Firestore, not here. */
function buildEnvDefault() {
  const layout = import.meta.env.VITE_DEFAULT_LAYOUT || '1';
  const resolvedLayout = LAYOUTS[layout] ? layout : '1';
  return { layout: resolvedLayout, slots: {}, virtualDisplayDelay: 10 };
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildEnvDefault();
    const saved = JSON.parse(raw);
    return { layout: '1', slots: {}, virtualDisplayDelay: 10, ...saved };
  } catch {
    return buildEnvDefault();
  }
}

/** Save only layout and slots — streams are stored in Firestore, not localStorage. */
export function saveConfig({ layout, slots, virtualDisplayDelay }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout, slots, virtualDisplayDelay }));
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
