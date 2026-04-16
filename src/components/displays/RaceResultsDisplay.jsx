import { useState, useEffect } from 'react';
import { subscribeResultRuns } from '../../firebase/results';

/**
 * Displays the most recently finished run.
 */
export default function RaceResultsDisplay() {
  const [run, setRun] = useState(null);

  useEffect(() => {
    return subscribeResultRuns((runs) => {
      setRun(runs.find((entry) => entry.status === 'finished') ?? null);
    });
  }, []);

  return (
    <div className="vd-root">
      <div className="vd-header">
        <span className="vd-header-sub">Dernier passage</span>
        <span className="vd-header-title">{run?.participantLabel ?? '—'}</span>
        {run?.status === 'finished' && <span className="vd-badge-finished">Terminé</span>}
      </div>

      {!run ? (
        <div className="vd-empty">Aucun passage terminé.</div>
      ) : (
        <div className="vd-list">
          <div className="vd-row" style={{ '--rank-color': '#f5c518' }}>
            <span className="vd-rank">1</span>
            <span className="vd-name">{run.participantLabel}</span>
            <span className="vd-time">{run.durationLabel ?? '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
