import { useState } from 'react';
import { LAYOUTS, generateId } from '../utils/storage';
import { parseIframe } from '../utils/iframeParser';
import LayoutPicker from '../components/LayoutPicker';

function OrientationToggle({ value, onChange }) {
  return (
    <div className="orientation-toggle">
      <button
        className={`orient-btn${value === 'landscape' ? ' active' : ''}`}
        onClick={() => onChange('landscape')}
        title="Paysage (16:9)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="2" y="5" width="20" height="14" rx="2" />
        </svg>
        Paysage
      </button>
      <button
        className={`orient-btn${value === 'portrait' ? ' active' : ''}`}
        onClick={() => onChange('portrait')}
        title="Portrait (9:16)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="7" y="2" width="10" height="20" rx="2" />
        </svg>
        Portrait
      </button>
    </div>
  );
}

export default function ConfigPage({ config, onUpdate }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [iframeInput, setIframeInput] = useState('');
  const [streamLabel, setStreamLabel] = useState('');
  const [orientation, setOrientation] = useState('landscape');
  const [parseError, setParseError] = useState('');

  const layout = LAYOUTS[config.layout] ?? LAYOUTS['1'];
  const { cols, slots: slotCount } = layout;

  // --- Layout ---
  const handleLayoutChange = (newLayout) => {
    onUpdate((prev) => ({ ...prev, layout: newLayout }));
  };

  // --- Slot assignment ---
  const handleSlotAssign = (slotIndex, streamId) => {
    onUpdate((prev) => ({
      ...prev,
      slots: { ...prev.slots, [slotIndex]: streamId || null },
    }));
  };

  // --- Iframe paste: auto-detect orientation ---
  const handleIframeChange = (e) => {
    const value = e.target.value;
    setIframeInput(value);
    setParseError('');
    if (value.trim()) {
      const parsed = parseIframe(value);
      if (parsed) setOrientation(parsed.orientation);
    }
  };

  // --- Add stream ---
  const handleAddStream = () => {
    setParseError('');
    const parsed = parseIframe(iframeInput);
    if (!parsed) {
      setParseError(
        'Code iframe invalide. Assurez-vous de coller le code complet <iframe ...> de Facebook.'
      );
      return;
    }
    const id = generateId();
    const label = streamLabel.trim() || `Flux ${config.streams.length + 1}`;
    onUpdate((prev) => ({
      ...prev,
      streams: [
        ...prev.streams,
        { id, label, src: parsed.src, videoUrl: parsed.videoUrl, orientation },
      ],
    }));
    setIframeInput('');
    setStreamLabel('');
    setOrientation('landscape');
    setShowAddForm(false);
  };

  // --- Remove stream ---
  const handleRemoveStream = (streamId) => {
    onUpdate((prev) => ({
      ...prev,
      streams: prev.streams.filter((s) => s.id !== streamId),
      slots: Object.fromEntries(
        Object.entries(prev.slots).map(([k, v]) => [k, v === streamId ? null : v])
      ),
    }));
  };

  // --- Rename stream ---
  const handleRenameStream = (streamId, newLabel) => {
    onUpdate((prev) => ({
      ...prev,
      streams: prev.streams.map((s) => (s.id === streamId ? { ...s, label: newLabel } : s)),
    }));
  };

  // --- Change stream orientation ---
  const handleOrientationChange = (streamId, newOrientation) => {
    onUpdate((prev) => ({
      ...prev,
      streams: prev.streams.map((s) =>
        s.id === streamId ? { ...s, orientation: newOrientation } : s
      ),
    }));
  };

  return (
    <div className="config-page">

      {/* ── Disposition ── */}
      <section className="config-section">
        <h2 className="section-title">Disposition</h2>
        <LayoutPicker selected={config.layout} onChange={handleLayoutChange} />
      </section>

      {/* ── Assignation des flux aux emplacements ── */}
      <section className="config-section">
        <h2 className="section-title">Assignation des flux</h2>
        {config.streams.length === 0 ? (
          <p className="hint">Ajoutez d'abord des flux dans la section ci-dessous.</p>
        ) : (
          <div
            className="slot-grid"
            style={{ gridTemplateColumns: `repeat(${Math.min(cols, 3)}, 1fr)` }}
          >
            {Array.from({ length: slotCount }, (_, i) => {
              const assignedId = config.slots[i] || '';
              const assignedStream = config.streams.find((s) => s.id === assignedId);
              return (
                <div key={i} className="slot-cell">
                  <div className="slot-index">Emplacement {i + 1}</div>
                  <select
                    className="slot-select"
                    value={assignedId}
                    onChange={(e) => handleSlotAssign(i, e.target.value)}
                  >
                    <option value="">— Aucun —</option>
                    {config.streams.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {assignedStream && (
                    <div className="slot-assigned-label">{assignedStream.label}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Bibliothèque de flux ── */}
      <section className="config-section">
        <h2 className="section-title">Flux vidéo</h2>

        <div className="stream-list">
          {config.streams.length === 0 && (
            <div className="stream-empty">Aucun flux ajouté pour l'instant.</div>
          )}
          {config.streams.map((stream) => (
            <div key={stream.id} className="stream-item">
              <div className="stream-thumb">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.582 6.186a2.506 2.506 0 0 0-1.765-1.77C18.254 4 12 4 12 4s-6.254 0-7.817.416a2.506 2.506 0 0 0-1.765 1.77C2 7.757 2 12 2 12s0 4.243.418 5.814a2.506 2.506 0 0 0 1.765 1.77C5.746 20 12 20 12 20s6.254 0 7.817-.416a2.506 2.506 0 0 0 1.765-1.77C22 16.243 22 12 22 12s0-4.243-.418-5.814zM10 15.464V8.536L16 12l-6 3.464z"/>
                </svg>
              </div>
              <div className="stream-info">
                <input
                  className="stream-label-input"
                  value={stream.label}
                  onChange={(e) => handleRenameStream(stream.id, e.target.value)}
                />
                <div className="stream-url" title={stream.videoUrl}>
                  {stream.videoUrl}
                </div>
              </div>
              <OrientationToggle
                value={stream.orientation ?? 'landscape'}
                onChange={(o) => handleOrientationChange(stream.id, o)}
              />
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleRemoveStream(stream.id)}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>

        {!showAddForm ? (
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            + Ajouter un flux
          </button>
        ) : (
          <div className="add-stream-form">
            <label className="form-label">Nom du flux</label>
            <input
              className="form-input"
              placeholder="Ex : Caméra principale"
              value={streamLabel}
              onChange={(e) => setStreamLabel(e.target.value)}
            />

            <label className="form-label">Code iframe Facebook</label>
            <textarea
              className="form-textarea"
              placeholder={'Collez ici le code <iframe ...> copié depuis Facebook\n(bouton Partager → Intégrer)'}
              value={iframeInput}
              onChange={handleIframeChange}
              rows={6}
              spellCheck={false}
            />

            <label className="form-label">Orientation</label>
            <OrientationToggle value={orientation} onChange={setOrientation} />

            {parseError && <div className="form-error">{parseError}</div>}

            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleAddStream}>
                Ajouter
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowAddForm(false);
                  setIframeInput('');
                  setStreamLabel('');
                  setOrientation('landscape');
                  setParseError('');
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
