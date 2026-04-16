import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { subscribeCurrentCompetitor, subscribeResultEvents, subscribeStation } from '../../firebase/results';
import { deriveFinishedCourses, deriveGeneralRanking } from '../../utils/resultsDerivation';

const MEDALS = ['#f5c518', '#b8c0cc', '#cd7f32'];

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

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
  const [cycleOrder, setCycleOrder] = useState([]);
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
  const slideKeys = useMemo(() => slides.map((slide) => slide.key), [slides]);

  useEffect(() => {
    if (slideKeys.length === 0) {
      setCycleOrder([]);
      setCurrentIndex(0);
      return;
    }

    setCycleOrder((prev) => {
      const stillValid = prev.filter((key) => slideKeys.includes(key));
      const missing = slideKeys.filter((key) => !stillValid.includes(key));
      const nextOrder = [...stillValid, ...shuffle(missing)];
      if (nextOrder.length === 0) {
        return shuffle(slideKeys);
      }
      return nextOrder;
    });
  }, [slideKeys]);

  useEffect(() => {
    if (cycleOrder.length === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((index) => Math.min(index, cycleOrder.length - 1));
  }, [cycleOrder.length]);

  const orderedSlides = useMemo(() => {
    if (cycleOrder.length === 0) return slides;
    const byKey = new Map(slides.map((slide) => [slide.key, slide]));
    return cycleOrder.map((key) => byKey.get(key)).filter(Boolean);
  }, [cycleOrder, slides]);

  const currentOrdered = orderedSlides[currentIndex] ?? orderedSlides[0] ?? null;

  useLayoutEffect(() => {
    if (!currentOrdered || !viewportRef.current || !listRef.current) {
      setOverflowPx(0);
      return;
    }

    const viewportHeight = viewportRef.current.clientHeight;
    const listHeight = listRef.current.scrollHeight;
    setOverflowPx(Math.max(0, listHeight - viewportHeight));
  }, [currentIndex, currentOrdered?.key, currentOrdered?.rows.length, visible]);

  useEffect(() => {
    setScrollOffset(0);
    setScrollDuration(0);
  }, [currentOrdered?.key]);

  useEffect(() => {
    if (!currentOrdered) return undefined;

    let cancelled = false;
    let fadeTimer;
    let advanceTimer;
    let scrollStartTimer;

    const advanceSlide = () => {
      if (orderedSlides.length <= 1) return;
      if (cancelled) return;
      setVisible(false);
      fadeTimer = setTimeout(() => {
        if (cancelled) return;
        setCurrentIndex((index) => {
          if (orderedSlides.length === 0) return 0;
          if (index < orderedSlides.length - 1) return index + 1;
          setCycleOrder(shuffle(slideKeys));
          return 0;
        });
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
    } else if (orderedSlides.length > 1) {
      advanceTimer = setTimeout(advanceSlide, Math.max(3, delay) * 1000);
    }

    return () => {
      cancelled = true;
      clearTimeout(scrollStartTimer);
      clearTimeout(advanceTimer);
      clearTimeout(fadeTimer);
    };
  }, [currentOrdered?.key, delay, endPause, orderedSlides.length, overflowPx, scrollSpeed, slideKeys, startPause]);

  return (
    <div className="vd-root">
      <div
        className="vd-fade-wrapper"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}
      >
        <div className="vd-header">
          {currentOrdered?.subtitle && <span className="vd-header-sub">{currentOrdered.subtitle}</span>}
          <span className="vd-header-title">{currentOrdered?.title ?? 'Résultats'}</span>
          {currentOrdered?.isCurrentCourse && <span className="vd-badge-finished">En cours</span>}
          {orderedSlides.length > 1 && <span className="vd-pager">{currentIndex + 1}/{orderedSlides.length}</span>}
        </div>

        {!currentOrdered || currentOrdered.rows.length === 0 ? (
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
              {currentOrdered.rows.map((row, index) => (
                <div key={row.startId ?? row.participantId} className="vd-row" style={{ '--rank-color': MEDALS[index] ?? 'var(--text)' }}>
                  <div className="vd-rank-stack">
                    <span className="vd-rank">{index + 1}</span>
                    {currentOrdered.type === 'ranking' && row.courseNumber != null && (
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
