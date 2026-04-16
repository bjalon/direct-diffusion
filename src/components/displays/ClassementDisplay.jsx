import { useState, useEffect } from 'react';
import { subscribeResultRuns } from '../../firebase/results';
import { parseTime } from '../../utils/time';

const MEDALS = ['#f5c518', '#b8c0cc', '#cd7f32'];

export default function ClassementDisplay() {
  const [classement, setClassement] = useState([]);

  useEffect(() => {
    return subscribeResultRuns((runs) => {
      const finished = runs.filter((run) => run.status === 'finished' && run.durationLabel);
      const best = {};
      finished.forEach((run) => {
        const t = parseTime(run.durationLabel);
        if (!best[run.participantId] || t < parseTime(best[run.participantId].durationLabel)) {
          best[run.participantId] = run;
        }
      });

      setClassement(
        Object.values(best).sort((a, b) => parseTime(a.durationLabel) - parseTime(b.durationLabel)),
      );
    });
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
