import { useState, useEffect } from 'react';
import { subscribeResultEvents } from '../../firebase/results';
import { deriveLatestCourse } from '../../utils/resultsDerivation';

/**
 * Displays the ranking of the most recently completed course.
 */
export default function RaceResultsDisplay() {
  const [course, setCourse] = useState(null);

  useEffect(() => {
    return subscribeResultEvents((events) => setCourse(deriveLatestCourse(events)));
  }, []);

  return (
    <div className="vd-root">
      <div className="vd-header">
        <span className="vd-header-sub">Dernier passage</span>
        <span className="vd-header-title">{course?.courseLabel ?? '—'}</span>
        {course && <span className="vd-badge-finished">Terminée</span>}
      </div>

      {!course ? (
        <div className="vd-empty">Aucune course terminée.</div>
      ) : (
        <div className="vd-list">
          {course.runs.map((run, index) => (
            <div key={run.startId} className="vd-row" style={{ '--rank-color': rankColor(index) }}>
              <span className="vd-rank">{index + 1}</span>
              <span className="vd-name">{run.participantLabel}</span>
              <span className="vd-time">{run.durationLabel ?? '—'}</span>
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
