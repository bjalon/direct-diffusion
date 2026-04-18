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
const DEFAULT_DISPLAY_CONFIGURATION_ID = 'default';
const DEFAULT_DISPLAY_CONFIGURATION_NAME = 'Configuration 1';

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

function buildEnvDefaultPreset() {
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

function normalizeSlots(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, value || null]),
  );
}

function normalizeDisplayConfiguration(raw, id = DEFAULT_DISPLAY_CONFIGURATION_ID, fallbackName = DEFAULT_DISPLAY_CONFIGURATION_NAME) {
  const defaults = buildEnvDefaultPreset();

  return {
    id,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : fallbackName,
    layout: typeof raw?.layout === 'string' && raw.layout ? raw.layout : defaults.layout,
    slots: normalizeSlots(raw?.slots),
    virtualDisplayDelay: Number.isFinite(raw?.virtualDisplayDelay) ? raw.virtualDisplayDelay : defaults.virtualDisplayDelay,
    virtualDisplayStartPause: Number.isFinite(raw?.virtualDisplayStartPause) ? raw.virtualDisplayStartPause : defaults.virtualDisplayStartPause,
    virtualDisplayScrollSpeed: Number.isFinite(raw?.virtualDisplayScrollSpeed) ? raw.virtualDisplayScrollSpeed : defaults.virtualDisplayScrollSpeed,
    virtualDisplayEndPause: Number.isFinite(raw?.virtualDisplayEndPause) ? raw.virtualDisplayEndPause : defaults.virtualDisplayEndPause,
  };
}

function expandConfigStore(configurations, activeConfigurationId) {
  const configurationIds = Object.keys(configurations);
  const resolvedActiveConfigurationId = configurations[activeConfigurationId]
    ? activeConfigurationId
    : configurationIds[0];
  const activeConfiguration = configurations[resolvedActiveConfigurationId];

  return {
    activeConfigurationId: resolvedActiveConfigurationId,
    configurations,
    layout: activeConfiguration.layout,
    slots: activeConfiguration.slots,
    virtualDisplayDelay: activeConfiguration.virtualDisplayDelay,
    virtualDisplayStartPause: activeConfiguration.virtualDisplayStartPause,
    virtualDisplayScrollSpeed: activeConfiguration.virtualDisplayScrollSpeed,
    virtualDisplayEndPause: activeConfiguration.virtualDisplayEndPause,
  };
}

export function normalizeConfigState(raw) {
  if (raw?.configurations && typeof raw.configurations === 'object') {
    const normalizedConfigurations = Object.fromEntries(
      Object.entries(raw.configurations)
        .map(([id, value], index) => [
          id,
          normalizeDisplayConfiguration(value, id, `Configuration ${index + 1}`),
        ])
        .filter(([, value]) => !!value),
    );

    if (Object.keys(normalizedConfigurations).length > 0) {
      return expandConfigStore(
        normalizedConfigurations,
        typeof raw.activeConfigurationId === 'string' ? raw.activeConfigurationId : DEFAULT_DISPLAY_CONFIGURATION_ID,
      );
    }
  }

  const defaultConfiguration = normalizeDisplayConfiguration(
    raw,
    DEFAULT_DISPLAY_CONFIGURATION_ID,
    DEFAULT_DISPLAY_CONFIGURATION_NAME,
  );

  return expandConfigStore(
    { [DEFAULT_DISPLAY_CONFIGURATION_ID]: defaultConfiguration },
    DEFAULT_DISPLAY_CONFIGURATION_ID,
  );
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeConfigState(null);
    return normalizeConfigState(JSON.parse(raw));
  } catch {
    return normalizeConfigState(null);
  }
}

export function saveConfig(config) {
  const normalizedConfig = normalizeConfigState(config);
  const persistedConfigurations = Object.fromEntries(
    Object.entries(normalizedConfig.configurations).map(([id, value]) => [
      id,
      {
        name: value.name,
        layout: value.layout,
        slots: value.slots,
        virtualDisplayDelay: value.virtualDisplayDelay,
        virtualDisplayStartPause: value.virtualDisplayStartPause,
        virtualDisplayScrollSpeed: value.virtualDisplayScrollSpeed,
        virtualDisplayEndPause: value.virtualDisplayEndPause,
      },
    ]),
  );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeConfigurationId: normalizedConfig.activeConfigurationId,
      configurations: persistedConfigurations,
    }),
  );
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function generateLayoutId() {
  return `custom-layout-${generateId()}`;
}
