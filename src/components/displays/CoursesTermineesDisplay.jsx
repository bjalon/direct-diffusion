import { useState, useEffect } from 'react';
import { subscribeResultEvents } from '../../firebase/results';
import { deriveFinishedCourses } from '../../utils/resultsDerivation';

/**
 * Cycles through finished runs.
 * delay: rotation interval in seconds (from stream config).
 */
export default function CoursesTermineesDisplay({ delay = 10 }) {
  const [courses, setCourses] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    return subscribeResultEvents((events) => setCourses(deriveFinishedCourses(events)));
  }, []);

  const currentCourse = courses[currentIndex] ?? null;

  // Auto-advance with fade transition
  useEffect(() => {
    if (courses.length <= 1) return;
    const ms = Math.max(3, delay) * 1000;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex((i) => (i + 1) % courses.length);
        setVisible(true);
      }, 400);
    }, ms);
    return () => clearInterval(timer);
  }, [courses.length, delay]);

  // Reset index when race list changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [courses.length]);

  return (
    <div className="vd-root">
      <div
        className="vd-fade-wrapper"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}
      >
        <div className="vd-header">
          <span className="vd-header-sub">Passage terminé</span>
          <span className="vd-header-title">{currentCourse?.courseLabel ?? '—'}</span>
          {currentCourse && <span className="vd-badge-finished">Terminée</span>}
          {courses.length > 1 && (
            <span className="vd-pager">
              {currentIndex + 1}/{courses.length}
            </span>
          )}
        </div>

        {!currentCourse ? (
          <div className="vd-empty">Aucun résultat.</div>
        ) : (
          <div className="vd-list">
            {currentCourse.runs.map((run, index) => (
              <div key={run.startId} className="vd-row" style={{ '--rank-color': rankColor(index) }}>
                <span className="vd-rank">{index + 1}</span>
                <span className="vd-name">{run.participantLabel}</span>
                <span className="vd-time">{run.durationLabel}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function rankColor(i) {
  return ['#f5c518', '#b8c0cc', '#cd7f32'][i] ?? 'var(--text)';
}
