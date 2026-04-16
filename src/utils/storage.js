function defineLayout({
  id,
  label,
  cols,
  rows,
  placements,
  previewCols = cols,
  previewRows = rows,
  custom = false,
}) {
  return {
    id,
    label,
    cols,
    rows,
    slots: placements.length,
    placements,
    previewCols,
    previewRows,
    custom,
  };
}

export const BUILTIN_LAYOUTS = {
  '1': defineLayout({
    id: '1',
    label: '1 flux',
    cols: 1,
    rows: 1,
    placements: [{ col: 1, row: 1 }],
  }),
  '1x2': defineLayout({
    id: '1x2',
    label: '2 cote a cote',
    cols: 2,
    rows: 1,
    placements: [{ col: 1, row: 1 }, { col: 2, row: 1 }],
  }),
  '2x1': defineLayout({
    id: '2x1',
    label: '2 empiles',
    cols: 1,
    rows: 2,
    placements: [{ col: 1, row: 1 }, { col: 1, row: 2 }],
  }),
  '1x3': defineLayout({
    id: '1x3',
    label: '3 cote a cote',
    cols: 3,
    rows: 1,
    placements: [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }],
  }),
  'landscape-center-3': defineLayout({
    id: 'landscape-center-3',
    label: '3 paysages centres',
    cols: 6,
    rows: 2,
    placements: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 5, row: 1, colSpan: 2, rowSpan: 2 },
    ],
  }),
  '3x1': defineLayout({
    id: '3x1',
    label: '3 empiles',
    cols: 1,
    rows: 3,
    placements: [{ col: 1, row: 1 }, { col: 1, row: 2 }, { col: 1, row: 3 }],
  }),
  '2x2': defineLayout({
    id: '2x2',
    label: '4 flux (2x2)',
    cols: 2,
    rows: 2,
    placements: [
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
    ],
  }),
  'portrait-left-3-landscapes': defineLayout({
    id: 'portrait-left-3-landscapes',
    label: 'Portrait gauche + 3 paysages',
    cols: 7,
    rows: 3,
    placements: [
      { col: 1, row: 1, rowSpan: 3 },
      { col: 2, row: 1, colSpan: 6 },
      { col: 2, row: 2, colSpan: 6 },
      { col: 2, row: 3, colSpan: 6 },
    ],
  }),
  'portrait-right-3-landscapes': defineLayout({
    id: 'portrait-right-3-landscapes',
    label: '3 paysages + portrait droite',
    cols: 7,
    rows: 3,
    placements: [
      { col: 1, row: 1, colSpan: 6 },
      { col: 1, row: 2, colSpan: 6 },
      { col: 1, row: 3, colSpan: 6 },
      { col: 7, row: 1, rowSpan: 3 },
    ],
  }),
  'portrait-center-3-landscapes': defineLayout({
    id: 'portrait-center-3-landscapes',
    label: '3 paysages + portrait centre',
    cols: 5,
    rows: 3,
    placements: [
      { col: 1, row: 1, colSpan: 2 },
      { col: 1, row: 2, colSpan: 2 },
      { col: 1, row: 3, colSpan: 2 },
      { col: 3, row: 1, rowSpan: 3, colSpan: 2 },
    ],
  }),
  'double-portrait-left-3-landscapes': defineLayout({
    id: 'double-portrait-left-3-landscapes',
    label: '2 portraits gauche + 3 paysages',
    cols: 8,
    rows: 3,
    placements: [
      { col: 1, row: 1, rowSpan: 3 },
      { col: 2, row: 1, rowSpan: 3 },
      { col: 3, row: 1, colSpan: 6 },
      { col: 3, row: 2, colSpan: 6 },
      { col: 3, row: 3, colSpan: 6 },
    ],
  }),
  'double-portrait-right-3-landscapes': defineLayout({
    id: 'double-portrait-right-3-landscapes',
    label: '3 paysages + 2 portraits droite',
    cols: 8,
    rows: 3,
    placements: [
      { col: 1, row: 1, colSpan: 6 },
      { col: 1, row: 2, colSpan: 6 },
      { col: 1, row: 3, colSpan: 6 },
      { col: 7, row: 1, rowSpan: 3 },
      { col: 8, row: 1, rowSpan: 3 },
    ],
  }),
  'double-portrait-sides-3-landscapes': defineLayout({
    id: 'double-portrait-sides-3-landscapes',
    label: '1 portrait gauche + 3 paysages + 1 portrait droite',
    cols: 9,
    rows: 3,
    placements: [
      { col: 1, row: 1, rowSpan: 3 },
      { col: 2, row: 1, colSpan: 7 },
      { col: 2, row: 2, colSpan: 7 },
      { col: 2, row: 3, colSpan: 7 },
      { col: 9, row: 1, rowSpan: 3 },
    ],
  }),
};

const STORAGE_KEY = 'direct-diffusion-config';
const CUSTOM_LAYOUTS_KEY = 'direct-diffusion-custom-layouts';

function normalizePlacement(raw) {
  return {
    col: Math.max(1, Number(raw.col) || 1),
    row: Math.max(1, Number(raw.row) || 1),
    colSpan: Math.max(1, Number(raw.colSpan) || 1),
    rowSpan: Math.max(1, Number(raw.rowSpan) || 1),
  };
}

function normalizeCustomLayout(id, raw) {
  const placements = Array.isArray(raw?.placements)
    ? raw.placements.map(normalizePlacement)
    : [];

  if (!raw?.label || !raw?.cols || !raw?.rows || placements.length === 0) {
    return null;
  }

  return defineLayout({
    id,
    label: raw.label,
    cols: Math.max(1, Number(raw.cols) || 1),
    rows: Math.max(1, Number(raw.rows) || 1),
    placements,
    previewCols: Math.max(1, Number(raw.previewCols) || Number(raw.cols) || 1),
    previewRows: Math.max(1, Number(raw.previewRows) || Number(raw.rows) || 1),
    custom: true,
  });
}

export function loadCustomLayouts() {
  try {
    const raw = localStorage.getItem(CUSTOM_LAYOUTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([id, value]) => [id, normalizeCustomLayout(id, value)])
        .filter(([, value]) => !!value),
    );
  } catch {
    return {};
  }
}

export function saveCustomLayouts(customLayouts) {
  localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(customLayouts));
}

export function getLayouts(customLayouts = loadCustomLayouts()) {
  return { ...BUILTIN_LAYOUTS, ...customLayouts };
}

export function isCustomLayoutId(layoutId) {
  return !!layoutId && !BUILTIN_LAYOUTS[layoutId];
}

function buildEnvDefault() {
  const layout = import.meta.env.VITE_DEFAULT_LAYOUT || '1';
  const resolvedLayout = BUILTIN_LAYOUTS[layout] ? layout : '1';
  return {
    layout: resolvedLayout,
    slots: {},
    virtualDisplayDelay: 10,
    virtualDisplayStartPause: 4,
    virtualDisplayScrollSpeed: 28,
    virtualDisplayEndPause: 4,
  };
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildEnvDefault();
    const saved = JSON.parse(raw);
    return {
      layout: '1',
      slots: {},
      virtualDisplayDelay: 10,
      virtualDisplayStartPause: 4,
      virtualDisplayScrollSpeed: 28,
      virtualDisplayEndPause: 4,
      ...saved,
    };
  } catch {
    return buildEnvDefault();
  }
}

export function saveConfig({
  layout,
  slots,
  virtualDisplayDelay,
  virtualDisplayStartPause,
  virtualDisplayScrollSpeed,
  virtualDisplayEndPause,
}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      layout,
      slots,
      virtualDisplayDelay,
      virtualDisplayStartPause,
      virtualDisplayScrollSpeed,
      virtualDisplayEndPause,
    }),
  );
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function generateLayoutId() {
  return `custom-layout-${generateId()}`;
}
