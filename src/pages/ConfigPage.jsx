import { useState } from 'react';
import { LAYOUTS, generateId } from '../utils/storage';
import { parseInput } from '../utils/iframeParser';
import LayoutPicker from '../components/LayoutPicker';

// ── Rotation picker ────────────────────────────────────────────────────────

const ROTATION_OPTIONS = [
  { value: 0,   label: '0°',    title: 'Pas de rotation' },
  { value: 90,  label: '+90°',  title: 'Rotation +90° (sens horaire)' },
  { value: -90, label: '−90°',  title: 'Rotation −90° (sens antihoraire)' },
  { value: 180, label: '180°',  title: 'Retournement' },
];

/** Read the effective rotation of a stream (supports legacy orientation field). */
function streamRotation(stream) {
  if (typeof stream.rotation === 'number') return stream.rotation;
  const legacy = { 'landscape-ccw': -90, 'landscape-cw': 90, 'landscape': -90, 'portrait': 0 };
  return legacy[stream.orientation] ?? 0;
}

function RotationPicker({ value, onChange }) {
  return (
    <div className="orientation-toggle">
      {ROTATION_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`orient-btn${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
          title={opt.title}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Delay picker (for courses-terminees) ──────────────────────────────────

const DELAY_OPTIONS = [5, 10, 15, 30, 60];

function DelayPicker({ value, onChange }) {
  return (
    <div className="orientation-toggle">
      {DELAY_OPTIONS.map((s) => (
        <button
          key={s}
          className={`orient-btn${value === s ? ' active' : ''}`}
          onClick={() => onChange(s)}
          title={`${s} secondes`}
        >
          {s}s
        </button>
      ))}
    </div>
  );
}

// ── Virtual stream definitions ─────────────────────────────────────────────

const VIRTUAL_TYPES = [
  { type: 'classement',        label: 'Classement général',  icon: '🏆' },
  { type: 'derniere-course',   label: 'Dernière course',     icon: '🏁' },
  { type: 'courses-terminees', label: 'Courses terminées',   icon: '🔄' },
];

// ── Config page ────────────────────────────────────────────────────────────

export default function ConfigPage({ config, onUpdate }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [iframeInput, setIframeInput] = useState('');
  const [streamLabel, setStreamLabel] = useState('');
  const [rotation, setRotation] = useState(0);
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

  // --- Iframe paste: auto-detect rotation from dimensions ---
  const handleIframeChange = (e) => {
    const value = e.target.value;
    setIframeInput(value);
    setParseError('');
    if (value.trim()) {
      const parsed = parseInput(value);
      // Suggest -90° when the iframe is portrait (phone likely held sideways).
      if (parsed) setRotation(parsed.originalHeight > parsed.originalWidth ? -90 : 0);
    }
  };

  // --- Add stream ---
  const handleAddStream = () => {
    setParseError('');
    const parsed = parseInput(iframeInput);
    if (!parsed) {
      setParseError(
        'Format invalide. Collez un lien Facebook (https://www.facebook.com/.../videos/...) ou un code <iframe ...>.'
      );
      return;
    }
    const id = generateId();
    const label = streamLabel.trim() || `Flux ${config.streams.length + 1}`;
    onUpdate((prev) => ({
      ...prev,
      streams: [
        ...prev.streams,
        {
          id,
          label,
          src: parsed.src,
          videoUrl: parsed.videoUrl,
          rotation,
          originalWidth: parsed.originalWidth,
          originalHeight: parsed.originalHeight,
        },
      ],
    }));
    setIframeInput('');
    setStreamLabel('');
    setRotation(0);
    setShowAddForm(false);
  };

  // --- Add virtual stream ---
  const handleAddVirtual = (vtype) => {
    const id = generateId();
    onUpdate((prev) => ({
      ...prev,
      streams: [
        ...prev.streams,
        { id, type: vtype.type, label: vtype.label, rotation: 0, delay: 10 },
      ],
    }));
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

  // --- Change delay (virtual streams) ---
  const handleDelayChange = (streamId, newDelay) => {
    onUpdate((prev) => ({
      ...prev,
      streams: prev.streams.map((s) =>
        s.id === streamId ? { ...s, delay: newDelay } : s
      ),
    }));
  };

  // --- Change rotation ---
  const handleRotationChange = (streamId, newRotation) => {
    onUpdate((prev) => ({
      ...prev,
      streams: prev.streams.map((s) =>
        s.id === streamId ? { ...s, rotation: newRotation } : s
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
                      <option key={s.id} value={s.id}>{s.label}</option>
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

      {/* ── Affichages virtuels ── */}
      <section className="config-section">
        <h2 className="section-title">Affichages virtuels</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Ces flux affichent les classements et résultats en temps réel.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {VIRTUAL_TYPES.map((vt) => (
            <button
              key={vt.type}
              className="btn btn-secondary"
              onClick={() => handleAddVirtual(vt)}
            >
              {vt.icon} {vt.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Bibliothèque de flux ── */}
      <section className="config-section">
        <h2 className="section-title">Flux vidéo</h2>

        <div className="stream-list">
          {config.streams.length === 0 && (
            <div className="stream-empty">Aucun flux ajouté pour l'instant.</div>
          )}
          {config.streams.map((stream) => {
            const vtype = VIRTUAL_TYPES.find((v) => v.type === stream.type);
            return (
              <div key={stream.id} className="stream-item">
                <div className="stream-thumb" title={vtype ? vtype.label : 'Flux Facebook'}>
                  {vtype ? (
                    <span style={{ fontSize: 20 }}>{vtype.icon}</span>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.582 6.186a2.506 2.506 0 0 0-1.765-1.77C18.254 4 12 4 12 4s-6.254 0-7.817.416a2.506 2.506 0 0 0-1.765 1.77C2 7.757 2 12 2 12s0 4.243.418 5.814a2.506 2.506 0 0 0 1.765 1.77C5.746 20 12 20 12 20s6.254 0 7.817-.416a2.506 2.506 0 0 0 1.765-1.77C22 16.243 22 12 22 12s0-4.243-.418-5.814zM10 15.464V8.536L16 12l-6 3.464z"/>
                    </svg>
                  )}
                </div>
                <div className="stream-info">
                  <input
                    className="stream-label-input"
                    value={stream.label}
                    onChange={(e) => handleRenameStream(stream.id, e.target.value)}
                  />
                  <div className="stream-url" title={stream.videoUrl ?? stream.type}>
                    {vtype ? vtype.label : stream.videoUrl}
                  </div>
                </div>
                {vtype?.type === 'courses-terminees' ? (
                  <DelayPicker
                    value={stream.delay ?? 10}
                    onChange={(d) => handleDelayChange(stream.id, d)}
                  />
                ) : !vtype ? (
                  <RotationPicker
                    value={streamRotation(stream)}
                    onChange={(r) => handleRotationChange(stream.id, r)}
                  />
                ) : null}
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleRemoveStream(stream.id)}
                >
                  Supprimer
                </button>
              </div>
            );
          })}
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

            <label className="form-label">Lien ou code iframe Facebook</label>
            <textarea
              className="form-textarea"
              placeholder={'Lien Facebook :\nhttps://www.facebook.com/xxx/videos/yyy/\n\nou code iframe complet :\n<iframe src="https://www.facebook.com/plugins/video.php?..." ...>'}
              value={iframeInput}
              onChange={handleIframeChange}
              rows={6}
              spellCheck={false}
            />

            <label className="form-label">Rotation</label>
            <RotationPicker value={rotation} onChange={setRotation} />

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
                  setRotation(0);
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
