import { useState, useEffect } from 'react';
import { subscribeRaces, fetchResults } from '../../firebase/races';
import { parseTime } from '../../utils/time';

const MEDALS = ['#f5c518', '#b8c0cc', '#cd7f32'];

export default function ClassementDisplay() {
  const [classement, setClassement] = useState([]);

  useEffect(() => {
    return subscribeRaces(async (races) => {
      const finished = races.filter((r) => r.finished);
      if (finished.length === 0) { setClassement([]); return; }

      // Fetch results for all finished races
      const allResults = (
        await Promise.all(finished.map((r) => fetchResults(r.id)))
      ).flat();

      // Best time per participant
      const best = {};
      allResults.forEach((r) => {
        const t = parseTime(r.time);
        if (!best[r.participantId] || t < parseTime(best[r.participantId].time)) {
          best[r.participantId] = r;
        }
      });

      setClassement(
        Object.values(best).sort((a, b) => parseTime(a.time) - parseTime(b.time)),
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
              <span className="vd-time">{entry.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
