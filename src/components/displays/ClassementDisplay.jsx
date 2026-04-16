import { useState, useEffect } from 'react';
import { subscribeResultEvents } from '../../firebase/results';
import { deriveGeneralRanking } from '../../utils/resultsDerivation';

const MEDALS = ['#f5c518', '#b8c0cc', '#cd7f32'];

export default function ClassementDisplay() {
  const [classement, setClassement] = useState([]);

  useEffect(() => {
    return subscribeResultEvents((events) => setClassement(deriveGeneralRanking(events)));
  }, []);

  return (
    <div className="vd-root">
      <div className="vd-header">
        <span className="vd-header-title">Classement Général</span>
      </div>

      {classement.length === 0 ? (
        <div className="vd-empty">En attente des résultats finalisés…</div>
      ) : (
        <div className="vd-list">
          {classement.map((entry, i) => (
            <div
              key={entry.participantId}
              className="vd-row"
              style={{ '--rank-color': MEDALS[i] ?? 'var(--text)' }}
            >
              <span className="vd-rank">{i + 1}</span>
              <span className="vd-name">{entry.participantLabel}</span>
              <span className="vd-time">{entry.durationLabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
