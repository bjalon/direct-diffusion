import { parseTime } from './time';

function sortByClientTimeAsc(a, b) {
  return (a.clickedAtClientMs ?? 0) - (b.clickedAtClientMs ?? 0);
}

function sortByClientTimeDesc(a, b) {
  return (b.clickedAtClientMs ?? 0) - (a.clickedAtClientMs ?? 0);
}

export function deriveRunsFromEvents(events) {
  const activeEvents = events.filter((event) => event.active !== false);
  const byStartId = new Map();

  activeEvents.forEach((event) => {
    const key = event.startId || event.runId;
    if (!key) return;
    const bucket = byStartId.get(key) ?? [];
    bucket.push(event);
    byStartId.set(key, bucket);
  });

  const runs = [];
  byStartId.forEach((bucket, startId) => {
    const starts = bucket.filter((event) => event.type === 'start').sort(sortByClientTimeAsc);
    const finishes = bucket.filter((event) => event.type === 'finish').sort(sortByClientTimeAsc);
    const abandons = bucket.filter((event) => event.type === 'abandon').sort(sortByClientTimeAsc);
    if (starts.length === 0) return;

    const latestStart = starts[starts.length - 1];
    const latestFinish = finishes[finishes.length - 1] ?? null;
    const latestAbandon = abandons[abandons.length - 1] ?? null;
    const lastTerminalEvent = [latestFinish, latestAbandon]
      .filter(Boolean)
      .sort(sortByClientTimeDesc)[0] ?? null;
    if (!lastTerminalEvent) return;

    if (!Number.isFinite(latestStart.clickedAtClientMs) || !Number.isFinite(lastTerminalEvent.clickedAtClientMs)) return;
    if (lastTerminalEvent.clickedAtClientMs < latestStart.clickedAtClientMs) return;

    const isAbandoned = lastTerminalEvent.type === 'abandon';
    const durationMs = isAbandoned ? null : lastTerminalEvent.clickedAtClientMs - latestStart.clickedAtClientMs;
    const run = {
      startId,
      runId: latestStart.runId || lastTerminalEvent.runId || startId,
      courseId: latestStart.courseId || lastTerminalEvent.courseId || '',
      courseLabel: latestStart.courseLabel || lastTerminalEvent.courseLabel || latestStart.courseId || lastTerminalEvent.courseId || '—',
      participantId: latestStart.participantId || lastTerminalEvent.participantId,
      participantLabel: latestStart.participantLabel || lastTerminalEvent.participantLabel || '—',
      latestStartClickId: latestStart.clickId,
      latestFinishClickId: latestFinish?.clickId ?? null,
      latestAbandonClickId: latestAbandon?.clickId ?? null,
      latestStartAtClientMs: latestStart.clickedAtClientMs,
      latestFinishAtClientMs: latestFinish?.clickedAtClientMs ?? null,
      latestAbandonAtClientMs: latestAbandon?.clickedAtClientMs ?? null,
      status: isAbandoned ? 'abandoned' : 'finished',
      isAbandoned,
      durationMs,
      durationLabel: durationMs == null ? null : (durationMs / 1000).toFixed(3),
      startEvents: starts,
      finishEvents: finishes,
      abandonEvents: abandons,
      lastEventAtClientMs: Math.max(latestStart.clickedAtClientMs, lastTerminalEvent.clickedAtClientMs),
    };
    runs.push(run);
  });

  return runs.sort((a, b) => b.lastEventAtClientMs - a.lastEventAtClientMs);
}

export function deriveCourseSummaries(events) {
  const runs = deriveRunsFromEvents(events);
  const byCourse = new Map();

  runs.forEach((run) => {
    if (!run.courseId) return;
    const course = byCourse.get(run.courseId) ?? {
      courseId: run.courseId,
      courseLabel: run.courseLabel,
      runs: [],
      abandonedRuns: [],
      lastFinishedAtClientMs: 0,
    };
    if (run.isAbandoned) {
      course.abandonedRuns.push(run);
    } else {
      course.runs.push(run);
    }
    course.lastFinishedAtClientMs = Math.max(course.lastFinishedAtClientMs, run.lastEventAtClientMs);
    byCourse.set(run.courseId, course);
  });

  return [...byCourse.values()]
    .map((course) => ({
      ...course,
      runs: [...course.runs].sort((a, b) => parseTime(a.durationLabel) - parseTime(b.durationLabel)),
      abandonedRuns: [...course.abandonedRuns].sort((a, b) => b.lastEventAtClientMs - a.lastEventAtClientMs),
      abandonSummary: [...course.abandonedRuns].reduce((acc, run) => {
        const key = run.participantId || run.participantLabel;
        const existing = acc.get(key) ?? {
          participantId: run.participantId,
          participantLabel: run.participantLabel,
          count: 0,
        };
        existing.count += 1;
        acc.set(key, existing);
        return acc;
      }, new Map()),
      startedAtClientMs: [...course.runs, ...course.abandonedRuns].reduce(
        (min, run) => Math.min(min, run.latestStartAtClientMs ?? Number.POSITIVE_INFINITY),
        Number.POSITIVE_INFINITY,
      ),
    }))
    .map((course) => ({
      ...course,
      abandonSummary: [...course.abandonSummary.values()].sort((a, b) => b.count - a.count || a.participantLabel.localeCompare(b.participantLabel)),
    }))
    .sort((a, b) => b.lastFinishedAtClientMs - a.lastFinishedAtClientMs);
}

export function deriveGeneralRanking(events) {
  const runs = deriveRunsFromEvents(events);
  const courseOrder = new Map(
    [...runs]
      .filter((run) => !run.isAbandoned)
      .filter((run) => run.courseId)
      .sort((a, b) => (a.latestStartAtClientMs ?? 0) - (b.latestStartAtClientMs ?? 0))
      .reduce((acc, run) => {
        if (!acc.some(([courseId]) => courseId === run.courseId)) {
          acc.push([run.courseId, acc.length + 1]);
        }
        return acc;
      }, []),
  );

  return [...runs]
    .filter((run) => !run.isAbandoned)
    .map((run) => ({
      ...run,
      courseNumber: courseOrder.get(run.courseId) ?? null,
    }))
    .sort((a, b) => parseTime(a.durationLabel) - parseTime(b.durationLabel));
}

export function deriveLatestCourse(events) {
  return deriveCourseSummaries(events)[0] ?? null;
}

export function deriveFinishedCourses(events) {
  return deriveCourseSummaries(events);
}

export function formatEventTimestamp(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('fr-FR');
}

export function sortEventsNewestFirst(events) {
  return [...events].sort(sortByClientTimeDesc);
}
