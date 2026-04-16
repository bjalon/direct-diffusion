import { useState, useEffect } from 'react';
import { subscribeResultRuns } from '../../firebase/results';

/**
 * Cycles through finished runs.
 * delay: rotation interval in seconds (from stream config).
 */
export default function CoursesTermineesDisplay({ delay = 10 }) {
  const [runs, setRuns] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    return subscribeResultRuns((entries) => {
      setRuns(entries.filter((entry) => entry.status === 'finished' && entry.durationLabel));
    });
  }, []);

  const currentRun = runs[currentIndex] ?? null;

  // Auto-advance with fade transition
  useEffect(() => {
    if (runs.length <= 1) return;
    const ms = Math.max(3, delay) * 1000;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex((i) => (i + 1) % runs.length);
        setVisible(true);
      }, 400);
    }, ms);
    return () => clearInterval(timer);
  }, [runs.length, delay]);

  // Reset index when race list changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [runs.length]);

  return (
    <div className="vd-root">
      <div
        className="vd-fade-wrapper"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}
      >
        <div className="vd-header">
          <span className="vd-header-sub">Passage terminé</span>
          <span className="vd-header-title">{currentRun?.participantLabel ?? '—'}</span>
          {currentRun?.status === 'finished' && <span className="vd-badge-finished">Terminé</span>}
          {runs.length > 1 && (
            <span className="vd-pager">
              {currentIndex + 1}/{runs.length}
            </span>
          )}
        </div>

        {!currentRun ? (
          <div className="vd-empty">Aucun résultat.</div>
        ) : (
          <div className="vd-list">
            <div className="vd-row" style={{ '--rank-color': '#f5c518' }}>
              <span className="vd-rank">1</span>
              <span className="vd-name">{currentRun.participantLabel}</span>
              <span className="vd-time">{currentRun.durationLabel}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
