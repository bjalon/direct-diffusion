import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { subscribeCurrentCompetitor, subscribeResultEvents, subscribeStation } from '../../firebase/results';
import { deriveFinishedCourses, deriveGeneralRanking } from '../../utils/resultsDerivation';

const MEDALS = ['#f5c518', '#b8c0cc', '#cd7f32'];

export default function ResultsRotationDisplay({
  delay = 10,
  startPause = 4,
  scrollSpeed = 28,
  endPause = 4,
}) {
  const [events, setEvents] = useState([]);
  const [currentCompetitor, setCurrentCompetitor] = useState(null);
  const [startStation, setStartStation] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [scrollDuration, setScrollDuration] = useState(0);
  const [overflowPx, setOverflowPx] = useState(0);
  const viewportRef = useRef(null);
  const listRef = useRef(null);

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

  useLayoutEffect(() => {
    if (!current || !viewportRef.current || !listRef.current) {
      setOverflowPx(0);
      return;
    }

    const viewportHeight = viewportRef.current.clientHeight;
    const listHeight = listRef.current.scrollHeight;
    setOverflowPx(Math.max(0, listHeight - viewportHeight));
  }, [currentIndex, current?.key, current?.rows.length, visible]);

  useEffect(() => {
    setScrollOffset(0);
    setScrollDuration(0);
  }, [current?.key]);

  useEffect(() => {
    if (!current) return undefined;

    let cancelled = false;
    let fadeTimer;
    let advanceTimer;
    let scrollStartTimer;

    const advanceSlide = () => {
      if (slides.length <= 1) return;
      if (cancelled) return;
      setVisible(false);
      fadeTimer = setTimeout(() => {
        if (cancelled) return;
        setCurrentIndex((index) => (slides.length > 0 ? (index + 1) % slides.length : 0));
        setVisible(true);
      }, 400);
    };

    if (overflowPx > 0) {
      const safeSpeed = Math.max(5, scrollSpeed);
      const scrollSeconds = overflowPx / safeSpeed;
      setScrollDuration(scrollSeconds);
      scrollStartTimer = setTimeout(() => {
        if (cancelled) return;
        setScrollOffset(overflowPx);
      }, Math.max(0, startPause) * 1000);
      advanceTimer = setTimeout(
        advanceSlide,
        (Math.max(0, startPause) + scrollSeconds + Math.max(0, endPause)) * 1000,
      );
    } else if (slides.length > 1) {
      advanceTimer = setTimeout(advanceSlide, Math.max(3, delay) * 1000);
    }

    return () => {
      cancelled = true;
      clearTimeout(scrollStartTimer);
      clearTimeout(advanceTimer);
      clearTimeout(fadeTimer);
    };
  }, [current?.key, delay, endPause, overflowPx, scrollSpeed, slides.length, startPause]);

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
          <div className="vd-list-viewport" ref={viewportRef}>
            <div
              className="vd-list"
              ref={listRef}
              style={{
                transform: `translateY(-${scrollOffset}px)`,
                transition: scrollDuration > 0 ? `transform ${scrollDuration}s linear` : 'none',
              }}
            >
              {current.rows.map((row, index) => (
                <div key={row.startId ?? row.participantId} className="vd-row" style={{ '--rank-color': MEDALS[index] ?? 'var(--text)' }}>
                  <div className="vd-rank-stack">
                    <span className="vd-rank">{index + 1}</span>
                    {current.type === 'ranking' && row.courseNumber != null && (
                      <span className="vd-course-number">C{row.courseNumber}</span>
                    )}
                  </div>
                  <span className="vd-name">{row.participantLabel}</span>
                  <span className="vd-time">{row.durationLabel}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
