import { useMemo, useState } from 'react';
import {
  getLayouts,
  loadCustomLayouts,
} from '../utils/storage';
import { BUILTIN_VIRTUAL_STREAM, BUILTIN_VIRTUAL_STREAM_ID } from '../utils/virtualDisplay';
import LayoutPicker from '../components/LayoutPicker';

const DELAY_OPTIONS = [5, 10, 15, 30, 60];

function streamRotation(stream) {
  if (typeof stream.rotation === 'number') return stream.rotation;
  const legacy = { 'landscape-ccw': -90, 'landscape-cw': 90, landscape: -90, portrait: 0 };
  return legacy[stream.orientation] ?? 0;
}

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

function NumberSetting({ label, value, onChange, min, max, step, suffix }) {
  return (
    <label className="virtual-setting">
      <span className="virtual-setting-label">{label}</span>
      <div className="virtual-setting-input-wrap">
        <input
          className="form-input virtual-setting-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="virtual-setting-suffix">{suffix}</span>}
      </div>
    </label>
  );
}

export default function ConfigPage({ config, onUpdate }) {
  const [customLayouts] = useState(loadCustomLayouts);

  const layouts = useMemo(() => getLayouts(customLayouts), [customLayouts]);
  const layout = layouts[config.layout] ?? layouts['1'];
  const { cols, slots: slotCount } = layout;
  const videoStreams = config.streams.filter((stream) => !stream.type);
  const availableStreams = [{ ...BUILTIN_VIRTUAL_STREAM, delay: config.virtualDisplayDelay ?? 10 }, ...videoStreams];

  const handleLayoutChange = (newLayout) => {
    onUpdate((prev) => ({ ...prev, layout: newLayout }));
  };

  const handleSlotAssign = (slotIndex, streamId) => {
    onUpdate((prev) => ({
      ...prev,
      slots: { ...prev.slots, [slotIndex]: streamId || null },
    }));
  };

  const handleDelayChange = (newDelay) => {
    onUpdate((prev) => ({
      ...prev,
      virtualDisplayDelay: newDelay,
    }));
  };

  const handleVirtualSettingChange = (key, nextValue, fallback, min) => {
    const safeValue = Number.isFinite(nextValue) ? nextValue : fallback;
    onUpdate((prev) => ({
      ...prev,
      [key]: Math.max(min, safeValue),
    }));
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <h2 className="section-title">Disposition</h2>
        <LayoutPicker selected={config.layout} onChange={handleLayoutChange} layouts={layouts} />
      </section>

      <section className="config-section">
        <h2 className="section-title">Assignation des flux</h2>
        {availableStreams.length === 0 ? (
          <p className="hint">Ajoutez d'abord des flux dans la section ci-dessous.</p>
        ) : (
          <div className="slot-grid" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 3)}, 1fr)` }}>
            {Array.from({ length: slotCount }, (_, i) => {
              const assignedId = config.slots[i] || '';
              const assignedStream = availableStreams.find((s) => s.id === assignedId);
              return (
                <div key={i} className="slot-cell">
                  <div className="slot-index">Emplacement {i + 1}</div>
                  <select
                    className="slot-select"
                    value={assignedId}
                    onChange={(e) => handleSlotAssign(i, e.target.value)}
                  >
                    <option value="">— Aucun —</option>
                    <option value={BUILTIN_VIRTUAL_STREAM_ID}>{BUILTIN_VIRTUAL_STREAM.label}</option>
                    {videoStreams.length > 0 && <option value="" disabled>──────── Flux vidéo ────────</option>}
                    {videoStreams.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  {assignedStream && <div className="slot-assigned-label">{assignedStream.label}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="config-section">
        <h2 className="section-title">Affichages virtuels</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Le flux virtuel “Résultats” alterne entre les courses terminées et le classement général.
        </p>
        <div className="virtual-settings-group">
          <div>
            <div className="virtual-settings-subtitle">Temporisation entre les vues</div>
            <DelayPicker value={config.virtualDisplayDelay ?? 10} onChange={handleDelayChange} />
          </div>
          <div className="virtual-settings-grid">
            <NumberSetting
              label="Pause avant scroll"
              value={config.virtualDisplayStartPause ?? 4}
              min={0}
              max={30}
              step={0.5}
              suffix="s"
              onChange={(value) => handleVirtualSettingChange('virtualDisplayStartPause', value, 4, 0)}
            />
            <NumberSetting
              label="Vitesse de scroll"
              value={config.virtualDisplayScrollSpeed ?? 28}
              min={5}
              max={200}
              step={1}
              suffix="px/s"
              onChange={(value) => handleVirtualSettingChange('virtualDisplayScrollSpeed', value, 28, 5)}
            />
            <NumberSetting
              label="Pause en bas"
              value={config.virtualDisplayEndPause ?? 4}
              min={0}
              max={30}
              step={0.5}
              suffix="s"
              onChange={(value) => handleVirtualSettingChange('virtualDisplayEndPause', value, 4, 0)}
            />
          </div>
        </div>
      </section>

      <section className="config-section">
        <h2 className="section-title">Flux vidéo</h2>

        <div className="stream-list">
          {videoStreams.length === 0 && <div className="stream-empty">Aucun flux ajouté pour l'instant.</div>}
          {videoStreams.map((stream) => (
            <div key={stream.id} className="stream-item">
              <div className="stream-thumb" title="Flux Facebook">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.582 6.186a2.506 2.506 0 0 0-1.765-1.77C18.254 4 12 4 12 4s-6.254 0-7.817.416a2.506 2.506 0 0 0-1.765 1.77C2 7.757 2 12 2 12s0 4.243.418 5.814a2.506 2.506 0 0 0 1.765 1.77C5.746 20 12 20 12 20s6.254 0 7.817-.416a2.506 2.506 0 0 0 1.765-1.77C22 16.243 22 12 22 12s0-4.243-.418-5.814zM10 15.464V8.536L16 12l-6 3.464z" />
                </svg>
              </div>
              <div className="stream-info">
                <span className="stream-label-input" style={{ cursor: 'default' }}>{stream.label}</span>
                <div className="stream-url" title={stream.videoUrl}>
                  {stream.videoUrl}
                </div>
              </div>
              <div className="admin-subline">
                Rotation : {streamRotation(stream)}°
                {stream.broadcastState === 'live' ? ' • Live' : ''}
                {stream.broadcastState === 'replay' ? ' • Rediffusion' : ''}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
