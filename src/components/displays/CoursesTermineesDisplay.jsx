import { useState, useEffect, useRef } from 'react';
import { subscribeRaces, subscribeResults } from '../../firebase/races';
import { parseTime } from '../../utils/time';

/**
 * Cycles through finished races (or shows first race if none are finished).
 * delay: rotation interval in seconds (from stream config).
 */
export default function CoursesTermineesDisplay({ delay = 10 }) {
  const [races, setRaces]             = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults]         = useState([]);
  const [visible, setVisible]         = useState(true);

  useEffect(() => subscribeRaces(setRaces), []);

  // Decide which races to display
  const displayRaces = races.filter((r) => r.finished);
  // If none finished, fall back to the first created race (last in desc list)
  const targetRaces = displayRaces.length > 0
    ? [...displayRaces].reverse()   // chronological order
    : races.length > 0 ? [races[races.length - 1]] : [];

  const currentRace = targetRaces[currentIndex] ?? null;

  // Subscribe to current race results
  useEffect(() => {
    if (!currentRace) { setResults([]); return; }
    return subscribeResults(currentRace.id, setResults);
  }, [currentRace?.id]);

  // Auto-advance with fade transition
  useEffect(() => {
    if (targetRaces.length <= 1) return;
    const ms = Math.max(3, delay) * 1000;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex((i) => (i + 1) % targetRaces.length);
        setVisible(true);
      }, 400);
    }, ms);
    return () => clearInterval(timer);
  }, [targetRaces.length, delay]);

  // Reset index when race list changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [targetRaces.length]);

  const ranked = [...results].sort((a, b) => parseTime(a.time) - parseTime(b.time));

  return (
    <div className="vd-root">
      <div
        className="vd-fade-wrapper"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}
      >
        <div className="vd-header">
          <span className="vd-header-sub">Course</span>
          <span className="vd-header-title">{currentRace?.number ?? '—'}</span>
          {currentRace?.finished && <span className="vd-badge-finished">Terminée</span>}
          {targetRaces.length > 1 && (
            <span className="vd-pager">
              {currentIndex + 1}/{targetRaces.length}
            </span>
          )}
        </div>

        {ranked.length === 0 ? (
          <div className="vd-empty">Aucun résultat.</div>
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
    </div>
  );
}

function rankColor(i) {
  return ['#f5c518', '#b8c0cc', '#cd7f32'][i] ?? 'var(--text)';
}
