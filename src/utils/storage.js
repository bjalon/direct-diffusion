function defineLayout({
  label,
  cols,
  rows,
  placements,
  previewCols = cols,
  previewRows = rows,
}) {
  return {
    label,
    cols,
    rows,
    slots: placements.length,
    placements,
    previewCols,
    previewRows,
  };
}

export const LAYOUTS = {
  '1': defineLayout({
    label: '1 flux',
    cols: 1,
    rows: 1,
    placements: [{ col: 1, row: 1 }],
  }),
  '1x2': defineLayout({
    label: '2 cote a cote',
    cols: 2,
    rows: 1,
    placements: [{ col: 1, row: 1 }, { col: 2, row: 1 }],
  }),
  '2x1': defineLayout({
    label: '2 empiles',
    cols: 1,
    rows: 2,
    placements: [{ col: 1, row: 1 }, { col: 1, row: 2 }],
  }),
  '1x3': defineLayout({
    label: '3 cote a cote',
    cols: 3,
    rows: 1,
    placements: [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }],
  }),
  'landscape-top-3': defineLayout({
    label: '3 paysages haut',
    cols: 6,
    rows: 3,
    placements: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 5, row: 1, colSpan: 2, rowSpan: 2 },
    ],
    previewCols: 6,
    previewRows: 3,
  }),
  'landscape-center-3': defineLayout({
    label: '3 paysages centres',
    cols: 6,
    rows: 2,
    placements: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 5, row: 1, colSpan: 2, rowSpan: 2 },
    ],
  }),
  'landscape-bottom-3': defineLayout({
    label: '3 paysages bas',
    cols: 6,
    rows: 3,
    placements: [
      { col: 1, row: 2, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 2, colSpan: 2, rowSpan: 2 },
      { col: 5, row: 2, colSpan: 2, rowSpan: 2 },
    ],
    previewCols: 6,
    previewRows: 3,
  }),
  '3x1': defineLayout({
    label: '3 empiles',
    cols: 1,
    rows: 3,
    placements: [{ col: 1, row: 1 }, { col: 1, row: 2 }, { col: 1, row: 3 }],
  }),
  '2x2': defineLayout({
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
    label: 'Portrait gauche + 3 paysages',
    cols: 4,
    rows: 3,
    placements: [
      { col: 1, row: 1, rowSpan: 3 },
      { col: 2, row: 1, colSpan: 3 },
      { col: 2, row: 2, colSpan: 3 },
      { col: 2, row: 3, colSpan: 3 },
    ],
  }),
  'portrait-right-3-landscapes': defineLayout({
    label: '3 paysages + portrait droite',
    cols: 4,
    rows: 3,
    placements: [
      { col: 1, row: 1, colSpan: 3 },
      { col: 1, row: 2, colSpan: 3 },
      { col: 1, row: 3, colSpan: 3 },
      { col: 4, row: 1, rowSpan: 3 },
    ],
  }),
  'portrait-center-3-landscapes': defineLayout({
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
  'portrait-band-top-3-landscapes': defineLayout({
    label: 'Portrait haut + 3 paysages',
    cols: 6,
    rows: 4,
    placements: [
      { col: 3, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 1, row: 3, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 3, colSpan: 2, rowSpan: 2 },
      { col: 5, row: 3, colSpan: 2, rowSpan: 2 },
    ],
    previewCols: 6,
    previewRows: 4,
  }),
  '3x2': defineLayout({
    label: '6 flux (3x2)',
    cols: 3,
    rows: 2,
    placements: [
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 3, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
      { col: 3, row: 2 },
    ],
  }),
  '2x3': defineLayout({
    label: '6 flux (2x3)',
    cols: 2,
    rows: 3,
    placements: [
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
      { col: 1, row: 3 },
      { col: 2, row: 3 },
    ],
  }),
  'hero-left-2': defineLayout({
    label: 'Hero + 2',
    cols: 3,
    rows: 2,
    placements: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 1 },
      { col: 3, row: 2 },
    ],
  }),
  'hero-top-2': defineLayout({
    label: 'Hero haut + 2',
    cols: 2,
    rows: 3,
    placements: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 1, row: 3 },
      { col: 2, row: 3 },
    ],
  }),
  'hero-left-4': defineLayout({
    label: 'Hero + 4',
    cols: 4,
    rows: 2,
    placements: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 1 },
      { col: 4, row: 1 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
    ],
  }),
  'banner-top-3': defineLayout({
    label: 'Bandeau + 3',
    cols: 3,
    rows: 2,
    placements: [
      { col: 1, row: 1, colSpan: 3 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
      { col: 3, row: 2 },
    ],
  }),
  'hero-right-2': defineLayout({
    label: '2 petits + hero',
    cols: 3,
    rows: 2,
    placements: [
      { col: 1, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 1, colSpan: 2, rowSpan: 2 },
    ],
  }),
  'hero-center-4': defineLayout({
    label: 'Hero centre + 4',
    cols: 4,
    rows: 3,
    placements: [
      { col: 1, row: 1, rowSpan: 2 },
      { col: 4, row: 1 },
      { col: 1, row: 3 },
      { col: 4, row: 2, rowSpan: 2 },
      { col: 2, row: 1, colSpan: 2, rowSpan: 3 },
    ],
  }),
  'left-band-4': defineLayout({
    label: 'Bandeau gauche + 4',
    cols: 3,
    rows: 4,
    placements: [
      { col: 1, row: 1, rowSpan: 4 },
      { col: 2, row: 1, rowSpan: 2 },
      { col: 3, row: 1, rowSpan: 2 },
      { col: 2, row: 3, rowSpan: 2 },
      { col: 3, row: 3, rowSpan: 2 },
    ],
  }),
  'hero-mix-6': defineLayout({
    label: 'Hero + 5 mixte',
    cols: 4,
    rows: 4,
    placements: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 3 },
      { col: 3, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 3, colSpan: 2 },
      { col: 1, row: 4 },
      { col: 2, row: 4 },
      { col: 3, row: 4, colSpan: 2 },
    ],
  }),
};

const STORAGE_KEY = 'direct-diffusion-config';

function buildEnvDefault() {
  const layout = import.meta.env.VITE_DEFAULT_LAYOUT || '1';
  const resolvedLayout = LAYOUTS[layout] ? layout : '1';
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
