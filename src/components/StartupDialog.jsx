/**
 * Dialog shown at startup when a streams.json is available AND a previous
 * config exists in localStorage. The user chooses which streams to use;
 * layout and slot assignments are always preserved.
 */
export default function StartupDialog({ defaultStreams, onKeep, onUseDefault }) {
  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2 className="dialog-title">Flux disponibles dans streams.json</h2>

        <p className="dialog-desc">
          Voulez-vous charger les flux par défaut&nbsp;?
        </p>

        <ul className="dialog-stream-list">
          {defaultStreams.map((s) => (
            <li key={s.id} className="dialog-stream-item">
              <span className="dialog-stream-label">{s.label}</span>
              <span className="dialog-stream-orient">
                {s.rotation === 0   ? '0°'
                 : s.rotation === 90  ? '+90°'
                 : s.rotation === -90 ? '−90°'
                 : s.rotation === 180 ? '180°'
                 : `${s.rotation}°`}
              </span>
            </li>
          ))}
        </ul>

        <p className="dialog-note">
          La disposition et les affectations actuelles sont conservées dans les deux cas.
        </p>

        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onUseDefault}>
            Charger les flux par défaut
          </button>
          <button className="btn btn-secondary" onClick={onKeep}>
            Garder la configuration précédente
          </button>
        </div>
      </div>
    </div>
  );
}
