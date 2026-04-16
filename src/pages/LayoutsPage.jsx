import { useMemo, useState } from 'react';
import {
  generateLayoutId,
  getLayouts,
  isCustomLayoutId,
  loadCustomLayouts,
  saveCustomLayouts,
} from '../utils/storage';
import LayoutPicker from '../components/LayoutPicker';

function NumberSetting({ label, value, onChange, min = 1, max = 12, step = 1 }) {
  return (
    <label className="virtual-setting">
      <span className="virtual-setting-label">{label}</span>
      <input
        className="form-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function createEmptyPlacement() {
  return { col: 1, row: 1, colSpan: 1, rowSpan: 1 };
}

function createInitialLayoutDraft() {
  return {
    id: '',
    label: '',
    cols: 3,
    rows: 2,
    placements: [createEmptyPlacement()],
  };
}

function normalizePlacement(placement) {
  return {
    col: Math.max(1, Number(placement.col) || 1),
    row: Math.max(1, Number(placement.row) || 1),
    colSpan: Math.max(1, Number(placement.colSpan) || 1),
    rowSpan: Math.max(1, Number(placement.rowSpan) || 1),
  };
}

function validateLayoutDraft(draft) {
  const cols = Math.max(1, Number(draft.cols) || 1);
  const rows = Math.max(1, Number(draft.rows) || 1);
  const placements = draft.placements.map(normalizePlacement);

  if (!draft.label.trim()) {
    return { ok: false, error: 'Le layout doit avoir un nom.' };
  }

  if (placements.length === 0) {
    return { ok: false, error: 'Ajoutez au moins une zone.' };
  }

  const occupied = new Set();
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    if (placement.col + placement.colSpan - 1 > cols || placement.row + placement.rowSpan - 1 > rows) {
      return { ok: false, error: `La zone ${index + 1} sort de la grille.` };
    }

    for (let col = placement.col; col < placement.col + placement.colSpan; col += 1) {
      for (let row = placement.row; row < placement.row + placement.rowSpan; row += 1) {
        const key = `${col}:${row}`;
        if (occupied.has(key)) {
          return { ok: false, error: `La zone ${index + 1} chevauche une autre zone.` };
        }
        occupied.add(key);
      }
    }
  }

  return {
    ok: true,
    value: {
      id: draft.id || generateLayoutId(),
      label: draft.label.trim(),
      cols,
      rows,
      previewCols: cols,
      previewRows: rows,
      placements,
      custom: true,
    },
  };
}

export default function LayoutsPage({ currentLayoutId }) {
  const [customLayouts, setCustomLayouts] = useState(loadCustomLayouts);
  const [selectedLayoutId, setSelectedLayoutId] = useState('');
  const [draft, setDraft] = useState(() => createInitialLayoutDraft());
  const [designerError, setDesignerError] = useState('');

  const layouts = useMemo(() => getLayouts(customLayouts), [customLayouts]);
  const customLayoutEntries = useMemo(
    () => Object.entries(layouts).filter(([id]) => isCustomLayoutId(id)),
    [layouts],
  );

  const previewLayout = useMemo(() => {
    const validation = validateLayoutDraft(draft);
    return validation.ok
      ? validation.value
      : {
          id: 'draft',
          label: draft.label || 'Aperçu',
          cols: Math.max(1, Number(draft.cols) || 1),
          rows: Math.max(1, Number(draft.rows) || 1),
          previewCols: Math.max(1, Number(draft.cols) || 1),
          previewRows: Math.max(1, Number(draft.rows) || 1),
          placements: draft.placements.map(normalizePlacement),
        };
  }, [draft]);

  const persistCustomLayouts = (nextCustomLayouts) => {
    setCustomLayouts(nextCustomLayouts);
    saveCustomLayouts(nextCustomLayouts);
  };

  const startNewLayout = () => {
    setSelectedLayoutId('');
    setDesignerError('');
    setDraft(createInitialLayoutDraft());
  };

  const loadLayoutIntoEditor = (layoutId) => {
    const layout = layouts[layoutId];
    if (!layout) return;
    setSelectedLayoutId(layoutId);
    setDesignerError('');
    setDraft({
      id: layout.id,
      label: layout.label,
      cols: layout.cols,
      rows: layout.rows,
      placements: layout.placements.map((placement) => ({ ...placement })),
    });
  };

  const saveLayout = () => {
    const validation = validateLayoutDraft(draft);
    if (!validation.ok) {
      setDesignerError(validation.error);
      return;
    }

    setDesignerError('');
    persistCustomLayouts({
      ...customLayouts,
      [validation.value.id]: validation.value,
    });
    setSelectedLayoutId(validation.value.id);
    setDraft({
      id: validation.value.id,
      label: validation.value.label,
      cols: validation.value.cols,
      rows: validation.value.rows,
      placements: validation.value.placements.map((placement) => ({ ...placement })),
    });
  };

  const deleteLayout = (layoutId) => {
    if (layoutId === currentLayoutId) return;
    const nextLayouts = { ...customLayouts };
    delete nextLayouts[layoutId];
    persistCustomLayouts(nextLayouts);
    if (selectedLayoutId === layoutId) {
      startNewLayout();
    }
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <h2 className="section-title">Designer de layouts</h2>
        <p className="hint">
          Créez vos propres grilles. Les layouts personnalisés sont stockés localement dans ce navigateur et
          deviennent disponibles dans l’onglet Flux.
        </p>
      </section>

      <div className="layout-designer-grid">
        <div className="layout-designer-panel">
          <div className="layout-designer-head">
            <div className="virtual-settings-subtitle">Layouts locaux</div>
            <button className="btn btn-secondary btn-sm" onClick={startNewLayout}>
              Nouveau
            </button>
          </div>

          {customLayoutEntries.length === 0 ? (
            <div className="stream-empty">Aucun layout local pour le moment.</div>
          ) : (
            <div className="layout-designer-list">
              {customLayoutEntries.map(([layoutId, layout]) => (
                <div key={layoutId} className={`layout-designer-item${selectedLayoutId === layoutId ? ' selected' : ''}`}>
                  <button className="layout-designer-item-main" onClick={() => loadLayoutIntoEditor(layoutId)}>
                    <span>
                      {layout.label}
                      {layoutId === currentLayoutId ? ' (actif)' : ''}
                    </span>
                    <span className="layout-designer-meta">{layout.slots} zones</span>
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => deleteLayout(layoutId)}
                    disabled={layoutId === currentLayoutId}
                    title={layoutId === currentLayoutId ? 'Le layout actif ne peut pas être supprimé.' : ''}
                  >
                    {layoutId === currentLayoutId ? 'Actif' : 'Supprimer'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="layout-designer-panel">
          <div className="virtual-settings-subtitle">Edition</div>
          <div className="layout-designer-form">
            <label className="virtual-setting">
              <span className="virtual-setting-label">Nom</span>
              <input
                className="form-input"
                value={draft.label}
                onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Ex : Hero perso"
              />
            </label>

            <div className="virtual-settings-grid">
              <NumberSetting
                label="Colonnes"
                value={draft.cols}
                onChange={(value) => setDraft((prev) => ({ ...prev, cols: Math.max(1, value) }))}
              />
              <NumberSetting
                label="Lignes"
                value={draft.rows}
                onChange={(value) => setDraft((prev) => ({ ...prev, rows: Math.max(1, value) }))}
              />
            </div>

            <div className="layout-zones-head">
              <div className="virtual-settings-subtitle">Zones</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setDraft((prev) => ({ ...prev, placements: [...prev.placements, createEmptyPlacement()] }))}
              >
                Ajouter une zone
              </button>
            </div>

            <div className="layout-zones-list">
              {draft.placements.map((placement, index) => (
                <div key={`${draft.id || 'draft'}-${index}`} className="layout-zone-card">
                  <div className="layout-zone-card-head">
                    <span>Zone {index + 1}</span>
                    {draft.placements.length > 1 && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDraft((prev) => ({
                          ...prev,
                          placements: prev.placements.filter((_, itemIndex) => itemIndex !== index),
                        }))}
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                  <div className="layout-zone-grid">
                    {[
                      ['Colonne', 'col'],
                      ['Ligne', 'row'],
                      ['Largeur', 'colSpan'],
                      ['Hauteur', 'rowSpan'],
                    ].map(([label, key]) => (
                      <label key={key} className="virtual-setting">
                        <span className="virtual-setting-label">{label}</span>
                        <input
                          className="form-input"
                          type="number"
                          min={1}
                          step={1}
                          value={placement[key]}
                          onChange={(e) => {
                            const nextValue = Math.max(1, Number(e.target.value) || 1);
                            setDraft((prev) => ({
                              ...prev,
                              placements: prev.placements.map((item, itemIndex) => (
                                itemIndex === index ? { ...item, [key]: nextValue } : item
                              )),
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {designerError && <div className="form-error">{designerError}</div>}

            <div className="form-actions">
              <button className="btn btn-primary" onClick={saveLayout}>
                Enregistrer le layout
              </button>
            </div>
          </div>
        </div>

        <div className="layout-designer-panel">
          <div className="virtual-settings-subtitle">Aperçu</div>
          <LayoutPicker selected={previewLayout.id} onChange={() => {}} layouts={{ [previewLayout.id]: previewLayout }} />
        </div>
      </div>
    </div>
  );
}
