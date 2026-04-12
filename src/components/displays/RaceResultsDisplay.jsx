import { useState, useEffect } from 'react';
import { subscribeRaces, subscribeResults } from '../../firebase/races';
import { parseTime } from '../../utils/time';

/**
 * Displays the results of the most recently CREATED race.
 */
export default function RaceResultsDisplay() {
  const [race, setRace]       = useState(null);
  const [results, setResults] = useState([]);

  // Track the latest race (first in the desc-sorted list)
  useEffect(() => {
    return subscribeRaces((races) => {
      setRace(races[0] ?? null);
    });
  }, []);

  useEffect(() => {
    if (!race) { setResults([]); return; }
    return subscribeResults(race.id, setResults);
  }, [race?.id]);

  const ranked = [...results].sort((a, b) => parseTime(a.time) - parseTime(b.time));

  return (
    <div className="vd-root">
      <div className="vd-header">
        <span className="vd-header-sub">Course</span>
        <span className="vd-header-title">{race?.number ?? '—'}</span>
        {race?.finished && <span className="vd-badge-finished">Terminée</span>}
      </div>

      {ranked.length === 0 ? (
        <div className="vd-empty">Aucun résultat pour cette course.</div>
      ) : (
        <div className="vd-list">
          {ranked.map((r, i) => (
            <div key={r.id} className="vd-row" style={{ '--rank-color': rankColor(i) }}>
              <span className="vd-rank">{i + 1}</span>
              <span className="vd-name">{r.participantLabel}</span>
              <span className="vd-time">{r.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function rankColor(i) {
  return ['#f5c518', '#b8c0cc', '#cd7f32'][i] ?? 'var(--text)';
}
