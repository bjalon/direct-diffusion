import { useEffect, useMemo, useState } from 'react';
import { subscribeCurrentCompetitor, subscribeResultEvents, subscribeStation } from '../../firebase/results';
import { deriveFinishedCourses, deriveGeneralRanking } from '../../utils/resultsDerivation';

const MEDALS = ['#f5c518', '#b8c0cc', '#cd7f32'];

export default function ResultsRotationDisplay({ delay = 10 }) {
  const [events, setEvents] = useState([]);
  const [currentCompetitor, setCurrentCompetitor] = useState(null);
  const [startStation, setStartStation] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => subscribeResultEvents(setEvents), []);
  useEffect(() => subscribeCurrentCompetitor(setCurrentCompetitor), []);
  useEffect(() => subscribeStation('start', setStartStation), []);

  const courses = useMemo(() => deriveFinishedCourses(events), [events]);
  const ranking = useMemo(() => deriveGeneralRanking(events), [events]);
  const activeCourseId = currentCompetitor?.courseId || startStation?.currentCourseId || null;
  const activeCourseLabel =
    currentCompetitor?.courseLabel
    || startStation?.currentCourseLabel
    || activeCourseId;

  const slides = useMemo(() => {
    const courseSlides = courses.map((course) => ({
      type: 'course',
      key: `course:${course.courseId}`,
      title: course.courseLabel,
      subtitle: 'Course',
      rows: course.runs,
      isCurrentCourse: activeCourseId === course.courseId,
    }));

    const hasCurrentCourseSlide = activeCourseId
      ? courseSlides.some((slide) => slide.key === `course:${activeCourseId}`)
      : false;

    if (activeCourseId && !hasCurrentCourseSlide) {
      courseSlides.unshift({
        type: 'course',
        key: `course:${activeCourseId}`,
        title: activeCourseLabel || activeCourseId,
        subtitle: 'Course',
        rows: currentCompetitor?.participantLabel
          ? [{
              startId: currentCompetitor.startId || currentCompetitor.runId || activeCourseId,
              participantLabel: currentCompetitor.participantLabel,
              durationLabel: 'En attente',
            }]
          : [{
              startId: activeCourseId,
              participantLabel: 'En attente du prochain départ',
              durationLabel: '—',
            }],
        isCurrentCourse: true,
      });
    }

    return [
      ...courseSlides,
      {
        type: 'ranking',
        key: 'ranking',
        title: 'Classement Général',
        subtitle: null,
        rows: ranking,
      },
    ];
  }, [
    courses,
    ranking,
    activeCourseId,
    activeCourseLabel,
    currentCompetitor?.participantLabel,
    currentCompetitor?.startId,
    currentCompetitor?.runId,
  ]);

  const current = slides[currentIndex] ?? slides[0] ?? null;

  useEffect(() => {
    if (slides.length <= 1) return;
    const ms = Math.max(3, delay) * 1000;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex((index) => (index + 1) % slides.length);
        setVisible(true);
      }, 400);
    }, ms);
    return () => clearInterval(timer);
  }, [slides.length, delay]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [slides.length]);

  return (
    <div className="vd-root">
      <div
        className="vd-fade-wrapper"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}
      >
        <div className="vd-header">
          {current?.subtitle && <span className="vd-header-sub">{current.subtitle}</span>}
          <span className="vd-header-title">{current?.title ?? 'Résultats'}</span>
          {current?.isCurrentCourse && <span className="vd-badge-finished">En cours</span>}
          {slides.length > 1 && <span className="vd-pager">{currentIndex + 1}/{slides.length}</span>}
        </div>

        {!current || current.rows.length === 0 ? (
          <div className="vd-empty">Aucun résultat.</div>
        ) : (
          <div className="vd-list">
            {current.rows.map((row, index) => (
              <div key={row.startId ?? row.participantId} className="vd-row" style={{ '--rank-color': MEDALS[index] ?? 'var(--text)' }}>
                <span className="vd-rank">{index + 1}</span>
                <span className="vd-name">{row.participantLabel}</span>
                <span className="vd-time">{row.durationLabel}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
