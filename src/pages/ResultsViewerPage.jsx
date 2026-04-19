import { useEffect, useMemo, useRef, useState } from 'react';
import { useEventContext } from '../context/EventContext';
import { subscribeCurrentCompetitor, subscribeResultEvents, subscribeStation } from '../firebase/results';
import { deriveFinishedCourses, deriveGeneralRanking } from '../utils/resultsDerivation';

const AUTO_SCROLL_SPEEDS = {
  slow: 18,
  medium: 32,
  fast: 52,
};

const AUTO_SCROLL_LABELS = {
  slow: 'Auto lent',
  medium: 'Auto moyen',
  fast: 'Auto rapide',
};

export default function ResultsViewerPage() {
  const { event } = useEventContext();
  const [events, setEvents] = useState([]);
  const [currentCompetitor, setCurrentCompetitor] = useState(null);
  const [startStation, setStartStation] = useState(null);
  const [activeSectionId, setActiveSectionId] = useState('competition');
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState('medium');
  const scrollRef = useRef(null);
  const sectionRefs = useRef(new Map());
  const navRefs = useRef(new Map());
  const holdUntilRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  useEffect(() => subscribeResultEvents(event.id, setEvents), [event.id]);
  useEffect(() => subscribeCurrentCompetitor(event.id, setCurrentCompetitor), [event.id]);
  useEffect(() => subscribeStation(event.id, 'start', setStartStation), [event.id]);

  const finishedCourses = useMemo(() => deriveFinishedCourses(events), [events]);
  const competitionRuns = useMemo(() => deriveGeneralRanking(events), [events]);

  const activeCourseId = currentCompetitor?.courseId || startStation?.currentCourseId || null;
  const activeCourseLabel = currentCompetitor?.courseLabel || startStation?.currentCourseLabel || activeCourseId || '';

  const sections = useMemo(() => {
    const courseSections = finishedCourses.map((course) => ({
      id: `course:${course.courseId}`,
      type: 'course',
      title: course.courseLabel || course.courseId || 'Course',
      courseId: course.courseId,
      rows: course.runs,
      abandonSummary: course.abandonSummary,
      isCurrentCourse: activeCourseId === course.courseId,
      isPendingOnly: false,
    }));

    if (activeCourseId && !courseSections.some((section) => section.courseId === activeCourseId)) {
      courseSections.unshift({
        id: `course:${activeCourseId}`,
        type: 'course',
        title: activeCourseLabel || activeCourseId,
        courseId: activeCourseId,
        rows: [],
        abandonSummary: [],
        isCurrentCourse: true,
        isPendingOnly: true,
      });
    }

    return [
      {
        id: 'competition',
        type: 'competition',
        title: 'Classement compétition',
        rows: competitionRuns,
        abandonSummary: [],
        isCurrentCourse: false,
        isPendingOnly: false,
      },
      ...courseSections,
    ];
  }, [activeCourseId, activeCourseLabel, competitionRuns, finishedCourses]);

  const summary = useMemo(() => ({
    courseCount: finishedCourses.length,
    runCount: finishedCourses.reduce((total, course) => total + course.runs.length, 0),
    abandonCount: finishedCourses.reduce(
      (total, course) => total + course.abandonSummary.reduce((sum, entry) => sum + entry.count, 0),
      0,
    ),
  }), [finishedCourses]);

  const pauseAutoScroll = (durationMs = 12000) => {
    holdUntilRef.current = Date.now() + durationMs;
  };

  const updateActiveSection = () => {
    const container = scrollRef.current;
    if (!container || sections.length === 0) return;

    const cursor = container.scrollTop + 24;
    let nextSectionId = sections[0].id;

    sections.forEach((section) => {
      const node = sectionRefs.current.get(section.id);
      if (!node) return;
      if (node.offsetTop <= cursor) {
        nextSectionId = section.id;
      }
    });

    setActiveSectionId((prev) => (prev === nextSectionId ? prev : nextSectionId));
  };

  const scrollToSection = (sectionId) => {
    const container = scrollRef.current;
    const sectionNode = sectionRefs.current.get(sectionId);
    if (!container || !sectionNode) return;

    pauseAutoScroll(16000);
    container.scrollTo({
      top: Math.max(0, sectionNode.offsetTop - 12),
      behavior: 'smooth',
    });
    setActiveSectionId(sectionId);
  };

  const handleScrollToTop = () => {
    const container = scrollRef.current;
    if (!container) return;
    pauseAutoScroll(12000);
    container.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToActiveCourse = () => {
    if (!activeCourseId) return;
    scrollToSection(`course:${activeCourseId}`);
  };

  useEffect(() => {
    if (sections.length === 0) {
      setActiveSectionId('competition');
      return;
    }

    if (!sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sections[0].id);
    }
  }, [activeSectionId, sections]);

  useEffect(() => {
    const button = navRefs.current.get(activeSectionId);
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeSectionId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return undefined;

    const handleScroll = () => updateActiveSection();
    container.addEventListener('scroll', handleScroll, { passive: true });
    requestAnimationFrame(updateActiveSection);

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [sections]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !autoScrollEnabled) return undefined;

    lastTsRef.current = 0;

    const step = (timestamp) => {
      const node = scrollRef.current;
      if (!node) return;

      if (!lastTsRef.current) {
        lastTsRef.current = timestamp;
      }

      const deltaMs = Math.min(48, timestamp - lastTsRef.current);
      lastTsRef.current = timestamp;

      const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
      if (maxScroll > 0 && Date.now() >= holdUntilRef.current) {
        const nextTop = node.scrollTop + ((AUTO_SCROLL_SPEEDS[autoScrollSpeed] || AUTO_SCROLL_SPEEDS.medium) * deltaMs) / 1000;
        node.scrollTop = nextTop >= maxScroll - 1 ? 0 : nextTop;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoScrollEnabled, autoScrollSpeed, sections.length]);

  return (
    <div className="results-browser-page">
      <aside className="results-browser-sidebar">
        <div className="results-browser-sidebar-head">
          <div className="results-browser-kicker">Navigation</div>
          <div className="results-browser-sidebar-title">Résultats</div>
          <div className="results-browser-sidebar-subtitle">
            {sections.length <= 1
              ? 'Compétition uniquement'
              : `${sections.length - 1} courses + compétition`}
          </div>
        </div>

        <div className="results-browser-stats">
          <SummaryCard label="Courses" value={summary.courseCount} accent="blue" />
          <SummaryCard label="Classés" value={summary.runCount} accent="green" />
          <SummaryCard label="Abandons" value={summary.abandonCount} accent="red" />
        </div>

        <div className="results-browser-nav" role="tablist" aria-label="Sections résultats">
          {sections.map((section) => {
            const metaLabel = section.type === 'competition'
              ? `${section.rows.length} classés`
              : buildCourseMeta(section);
            const isActive = activeSectionId === section.id;

            return (
              <button
                key={section.id}
                ref={(node) => {
                  if (node) navRefs.current.set(section.id, node);
                  else navRefs.current.delete(section.id);
                }}
                className={`results-browser-nav-item${isActive ? ' is-active' : ''}`}
                onClick={() => scrollToSection(section.id)}
                aria-selected={isActive}
                role="tab"
                type="button"
              >
                <span className="results-browser-nav-title">{section.title}</span>
                <span className="results-browser-nav-meta">{metaLabel}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="results-browser-main">
        <div className="results-browser-toolbar">
          <div className="results-browser-toolbar-copy">
            <div className="results-browser-kicker">Consultation</div>
            <h1 className="results-browser-title">Toutes les courses et le classement général</h1>
            <p className="results-browser-subtitle">
              Le scroll descend automatiquement, mais tu peux reprendre la main à tout moment avec la souris, le tactile ou les raccourcis de navigation.
            </p>
          </div>

          <div className="results-browser-controls">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setAutoScrollEnabled((value) => !value)}
              type="button"
            >
              {autoScrollEnabled ? 'Pause auto' : 'Reprendre auto'}
            </button>

            <select
              className="form-input results-browser-speed"
              value={autoScrollSpeed}
              onChange={(e) => setAutoScrollSpeed(e.target.value)}
              disabled={!autoScrollEnabled}
            >
              {Object.entries(AUTO_SCROLL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleScrollToActiveCourse}
              disabled={!activeCourseId}
              type="button"
            >
              Course en cours
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleScrollToTop}
              type="button"
            >
              Haut
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="results-browser-scroll"
          onWheel={() => pauseAutoScroll()}
          onPointerDown={() => pauseAutoScroll()}
          onTouchStart={() => pauseAutoScroll()}
        >
          {sections.map((section) => (
            <article
              key={section.id}
              ref={(node) => {
                if (node) sectionRefs.current.set(section.id, node);
                else sectionRefs.current.delete(section.id);
              }}
              className={`results-browser-section${section.isCurrentCourse ? ' is-current' : ''}`}
            >
              <header className="results-browser-section-head">
                <div className="results-browser-section-copy">
                  <div className="results-browser-section-kicker">
                    {section.type === 'competition' ? 'Compétition' : 'Course'}
                  </div>
                  <h2 className="results-browser-section-title">{section.title}</h2>
                </div>
                <div className="results-browser-section-meta">
                  {section.isCurrentCourse && <span className="results-browser-badge">En cours</span>}
                  {section.type === 'competition' ? (
                    <span className="results-browser-chip">{section.rows.length} classés</span>
                  ) : (
                    <>
                      <span className="results-browser-chip">{section.rows.length} classés</span>
                      <span className="results-browser-chip">
                        {section.abandonSummary.reduce((total, entry) => total + entry.count, 0)} abandons
                      </span>
                    </>
                  )}
                </div>
              </header>

              {section.rows.length === 0 ? (
                <div className="results-browser-empty">
                  {section.isPendingOnly
                    ? 'Course armée, aucun résultat finalisé pour le moment.'
                    : section.type === 'competition'
                      ? 'Le classement général apparaîtra dès le premier run terminé.'
                      : 'Aucun run terminé sur cette course.'}
                </div>
              ) : (
                <div className="results-browser-list">
                  {section.rows.map((row, index) => (
                    <div
                      key={`${section.id}:${row.startId ?? row.participantId ?? row.participantLabel}:${index}`}
                      className="results-browser-row"
                    >
                      <div className="results-browser-rank">{index + 1}</div>
                      <div className="results-browser-row-main">
                        <div className="results-browser-name" title={row.participantLabel}>
                          {row.participantLabel}
                        </div>
                        {section.type === 'competition' && row.courseNumber != null && (
                          <div className="results-browser-row-subline">Course {row.courseNumber}</div>
                        )}
                      </div>
                      <div className="results-browser-time">{row.durationLabel || '—'}</div>
                    </div>
                  ))}
                </div>
              )}

              {section.type === 'course' && section.abandonSummary.length > 0 && (
                <div className="results-browser-abandons">
                  <div className="results-browser-abandons-title">Abandons</div>
                  <div className="results-browser-abandons-list">
                    {section.abandonSummary.map((entry) => (
                      <div
                        key={`${section.id}:abandon:${entry.participantId ?? entry.participantLabel}`}
                        className="results-browser-abandon-pill"
                      >
                        <span className="results-browser-abandon-name" title={entry.participantLabel}>
                          {entry.participantLabel}
                        </span>
                        <span className="results-browser-abandon-count">{entry.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className={`results-browser-stat results-browser-stat--${accent}`}>
      <div className="results-browser-stat-value">{value}</div>
      <div className="results-browser-stat-label">{label}</div>
    </div>
  );
}

function buildCourseMeta(section) {
  if (section.isPendingOnly) return 'En attente';

  const abandonCount = section.abandonSummary.reduce((total, entry) => total + entry.count, 0);
  if (abandonCount > 0) {
    return `${section.rows.length} classés · ${abandonCount} abandons`;
  }
  return `${section.rows.length} classés`;
}
