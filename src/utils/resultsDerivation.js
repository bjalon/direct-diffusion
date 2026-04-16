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
    if (starts.length === 0 || finishes.length === 0) return;

    const latestStart = starts[starts.length - 1];
    const latestFinish = finishes[finishes.length - 1];
    if (!Number.isFinite(latestStart.clickedAtClientMs) || !Number.isFinite(latestFinish.clickedAtClientMs)) return;
    if (latestFinish.clickedAtClientMs < latestStart.clickedAtClientMs) return;

    const durationMs = latestFinish.clickedAtClientMs - latestStart.clickedAtClientMs;
    const run = {
      startId,
      runId: latestStart.runId || latestFinish.runId || startId,
      courseId: latestStart.courseId || latestFinish.courseId || '',
      courseLabel: latestStart.courseLabel || latestFinish.courseLabel || latestStart.courseId || latestFinish.courseId || '—',
      participantId: latestStart.participantId || latestFinish.participantId,
      participantLabel: latestStart.participantLabel || latestFinish.participantLabel || '—',
      latestStartClickId: latestStart.clickId,
      latestFinishClickId: latestFinish.clickId,
      latestStartAtClientMs: latestStart.clickedAtClientMs,
      latestFinishAtClientMs: latestFinish.clickedAtClientMs,
      durationMs,
      durationLabel: (durationMs / 1000).toFixed(3),
      startEvents: starts,
      finishEvents: finishes,
      lastEventAtClientMs: Math.max(latestStart.clickedAtClientMs, latestFinish.clickedAtClientMs),
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
      lastFinishedAtClientMs: 0,
    };
    course.runs.push(run);
    course.lastFinishedAtClientMs = Math.max(course.lastFinishedAtClientMs, run.lastEventAtClientMs);
    byCourse.set(run.courseId, course);
  });

  return [...byCourse.values()]
    .map((course) => ({
      ...course,
      runs: [...course.runs].sort((a, b) => parseTime(a.durationLabel) - parseTime(b.durationLabel)),
    }))
    .sort((a, b) => b.lastFinishedAtClientMs - a.lastFinishedAtClientMs);
}

export function deriveGeneralRanking(events) {
  const runs = deriveRunsFromEvents(events);
  const bestByParticipant = new Map();

  runs.forEach((run) => {
    const existing = bestByParticipant.get(run.participantId);
    if (!existing || parseTime(run.durationLabel) < parseTime(existing.durationLabel)) {
      bestByParticipant.set(run.participantId, run);
    }
  });

  return [...bestByParticipant.values()].sort((a, b) => parseTime(a.durationLabel) - parseTime(b.durationLabel));
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
