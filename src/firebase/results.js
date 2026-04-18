import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { formatDurationMs } from '../utils/resultsBuffer';
import { createLogger } from '../utils/logger';
import {
  RESULT_ARCHIVE_FILENAME,
  RESULT_ARCHIVE_MODEL,
  RESULT_ARCHIVE_MODEL_VERSION,
} from '../utils/resultArchiveModel';
import { createSingleFileZip, readSingleFileZip } from '../utils/zipSingleFile';

const RESULT_ACCESS = (uid) => doc(db, 'allowedResultUsers', uid);
const RESULT_REQUEST = (uid) => doc(db, 'resultAccessRequests', uid);
const RESULT_STATION = (station) => doc(db, 'resultStations', station);
const CURRENT_STATION = (station) => doc(
  db,
  'currentStations',
  station === 'start' ? 'currentStart' : 'currentFinish',
);
const CURRENT_COMPETITOR = doc(db, 'currentCompetitor', 'current');
const RESULT_EVENT = (eventId) => doc(db, 'resultEvents', eventId);
const RESULT_RUN = (runId) => doc(db, 'resultRuns', runId);
const CLOCK_CHECK = (uid) => doc(db, 'clockChecks', uid);
const PARTICIPANT = (id) => doc(db, 'participants', id);
const STREAMS_REF = doc(db, 'config', 'streams');
const log = createLogger('firebase/results');

function normalizeLightRoles(data) {
  const tv = !!data.tv;
  return {
    results_start: tv ? false : !!data.results_start,
    results_finish: tv ? false : !!data.results_finish,
    tv,
  };
}

function serializeValue(value) {
  if (value instanceof Timestamp) {
    return { __type: 'timestamp', millis: value.toMillis() };
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]));
  }
  return value;
}

function deserializeValue(value) {
  if (Array.isArray(value)) {
    return value.map(deserializeValue);
  }
  if (value && typeof value === 'object') {
    if (value.__type === 'timestamp') {
      return Timestamp.fromMillis(value.millis);
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deserializeValue(entry)]));
  }
  return value;
}

function createAdminEntityId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getCourseDocs(collectionName, courseId) {
  const snap = await getDocs(query(collection(db, collectionName), where('courseId', '==', courseId)));
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

async function getAllDocs(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export function subscribeResultAccess(uid, onData) {
  if (!uid) {
    onData(null);
    return () => {};
  }

  return onSnapshot(RESULT_ACCESS(uid), (snap) => {
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    log.debug('result access snapshot', { uid, data });
    onData(data);
  }, (error) => {
    log.error('result access subscription failed', { uid, error });
  });
}

export function subscribeResultAccessRequest(uid, onData) {
  if (!uid) {
    onData(null);
    return () => {};
  }

  return onSnapshot(RESULT_REQUEST(uid), (snap) => {
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    log.debug('result access request snapshot', { uid, data });
    onData(data);
  }, (error) => {
    log.error('result access request subscription failed', { uid, error });
  });
}

export function subscribePendingResultAccessRequests(onData) {
  return onSnapshot(collection(db, 'resultAccessRequests'), (snap) => {
    const requests = snap.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .filter((entry) => entry.status === 'pending')
      .sort((a, b) => (b.requestedAt?.toMillis?.() ?? 0) - (a.requestedAt?.toMillis?.() ?? 0));
    onData(requests);
  });
}

export function subscribeAllowedResultUsers(onData) {
  return onSnapshot(collection(db, 'allowedResultUsers'), (snap) => {
    const users = snap.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '') || a.id.localeCompare(b.id));
    onData(users);
  });
}

export function subscribeResultEvents(onData) {
  return onSnapshot(
    query(collection(db, 'resultEvents'), orderBy('clickedAtClientMs', 'desc')),
    (snap) => {
      const events = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      log.debug('resultEvents snapshot', { count: events.length });
      onData(events);
    },
    (error) => {
      log.error('resultEvents subscription failed', error);
    },
  );
}

export function submitResultAccessRequest({ uid, email, providerId }) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('submitResultAccessRequest', { uid, email: normalizedEmail, providerId });
  return setDoc(
    RESULT_REQUEST(uid),
    {
      uid,
      email: normalizedEmail,
      providerId: providerId ?? 'anonymous',
      status: 'pending',
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function approveResultAccessRequest(uid) {
  log.info('approveResultAccessRequest', { uid });
  return getDoc(RESULT_REQUEST(uid)).then((snap) => {
    const request = snap.exists() ? snap.data() : {};
    return setDoc(
      RESULT_ACCESS(uid),
      {
        uid,
        email: (request.email ?? '').trim().toLowerCase(),
        results_start: false,
        results_finish: false,
        tv: false,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ).then(() => updateDoc(RESULT_REQUEST(uid), {
      status: 'approved',
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });
}

export function rejectResultAccessRequest(uid) {
  log.info('rejectResultAccessRequest', { uid });
  return updateDoc(RESULT_REQUEST(uid), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function saveAllowedResultUser(uid, data) {
  log.info('saveAllowedResultUser', { uid, data });
  const roles = normalizeLightRoles(data);
  return setDoc(
    RESULT_ACCESS(uid),
    {
      uid,
      email: (data.email ?? '').trim().toLowerCase(),
      ...roles,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function deleteAllowedResultUser(uid) {
  log.info('deleteAllowedResultUser', { uid });
  return deleteDoc(RESULT_ACCESS(uid));
}

export function subscribeStation(station, onData) {
  return onSnapshot(RESULT_STATION(station), (snap) => {
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    log.debug('station snapshot', { station, data });
    onData(data);
  }, (error) => {
    log.error('station subscription failed', { station, error });
  });
}

export function subscribeCurrentStationAssignment(station, onData, onError) {
  return onSnapshot(CURRENT_STATION(station), (snap) => {
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    log.debug('current station snapshot', { station, data });
    onData(data);
  }, (error) => {
    log.error('current station subscription failed', { station, error });
    onError?.(error);
  });
}

export async function readCurrentStationAssignment(station) {
  try {
    const snap = await getDoc(CURRENT_STATION(station));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    if (error?.code === 'permission-denied') {
      log.debug('current station read denied', { station });
      return null;
    }
    throw error;
  }
}

async function assertStationOwned(station, uid) {
  const snap = await getDoc(CURRENT_STATION(station));
  if (!snap.exists()) {
    throw new Error('station-not-claimed');
  }
  if (snap.data().assignedUid !== uid) {
    throw new Error('station-not-owned');
  }
  return snap.data();
}

export async function claimStation(station, actor) {
  log.info('claimStation start', { station, actor });
  try {
    await setDoc(CURRENT_STATION(station), {
      station,
      assignedUid: actor.uid,
      assignedEmail: actor.email ?? '',
      assignedProviderId: actor.providerId ?? 'anonymous',
      updatedAt: serverTimestamp(),
      assignedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw new Error('station-occupied');
    }
    throw error;
  }
}

export async function setStartStationCourse({ uid, courseId, courseLabel }) {
  log.info('setStartStationCourse start', { uid, courseId, courseLabel });
  await runTransaction(db, async (transaction) => {
    const currentStationSnap = await transaction.get(CURRENT_STATION('start'));
    if (!currentStationSnap.exists()) {
      throw new Error('station-not-claimed');
    }
    if (currentStationSnap.data().assignedUid !== uid) {
      throw new Error('station-not-owned');
    }

    const ref = RESULT_STATION('start');
    const snap = await transaction.get(ref);

    transaction.set(ref, {
      station: 'start',
      currentCourseId: courseId ?? null,
      currentCourseLabel: courseId ? (courseLabel ?? '') : '',
      currentCourseUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export async function releaseStation(station, uid) {
  log.info('releaseStation start', { station, uid });
  await deleteDoc(CURRENT_STATION(station));
}

export async function releaseStationAsAdmin(station) {
  log.info('releaseStationAsAdmin start', { station });
  const ref = CURRENT_STATION(station);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await deleteDoc(ref);
}

export function subscribeCurrentCompetitor(onData) {
  return onSnapshot(CURRENT_COMPETITOR, (snap) => {
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    log.debug('current competitor snapshot', data);
    onData(data);
  }, (error) => {
    log.error('current competitor subscription failed', error);
  });
}

export async function armCurrentCompetitor({
  participant,
  actor,
  runId,
  startId,
  courseId,
  courseLabel,
  selectedAtClientMs,
}) {
  log.info('armCurrentCompetitor start', {
    participantId: participant.id,
    participantLabel: participant.label,
    actor,
    runId,
    startId,
    courseId,
    courseLabel,
    selectedAtClientMs,
  });
  const selectedAtClientIso = new Date(selectedAtClientMs).toISOString();

  await runTransaction(db, async (transaction) => {
    const stationSnap = await transaction.get(CURRENT_STATION('start'));
    if (!stationSnap.exists()) {
      throw new Error('station-not-claimed');
    }
    if (stationSnap.data().assignedUid !== actor.uid) {
      throw new Error('station-not-owned');
    }

    const currentSnap = await transaction.get(CURRENT_COMPETITOR);
    if (currentSnap.exists()) {
      throw new Error('current-competitor-busy');
    }

    transaction.set(CURRENT_COMPETITOR, {
      runId,
      startId,
      courseId,
      courseLabel,
      participantId: participant.id,
      participantLabel: participant.label,
      status: 'armed',
      selectedByUid: actor.uid,
      selectedByEmail: actor.email ?? '',
      selectedAtClientMs,
      selectedAtClientIso,
      selectedAtServer: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.set(RESULT_RUN(runId), {
      runId,
      startId,
      courseId,
      courseLabel,
      participantId: participant.id,
      participantLabel: participant.label,
      status: 'armed',
      selectedByUid: actor.uid,
      selectedByEmail: actor.email ?? '',
      selectedAtClientMs,
      selectedAtClientIso,
      selectedAtServer: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export async function cancelCurrentCompetitor(runId, uid) {
  log.info('cancelCurrentCompetitor start', { runId, uid });
  await runTransaction(db, async (transaction) => {
    const stationSnap = await transaction.get(CURRENT_STATION('start'));
    if (!stationSnap.exists()) {
      throw new Error('station-not-claimed');
    }
    if (stationSnap.data().assignedUid !== uid) {
      throw new Error('station-not-owned');
    }

    const snap = await transaction.get(CURRENT_COMPETITOR);
    if (!snap.exists()) return;

    const current = snap.data();
    if (current.runId !== runId || current.selectedByUid !== uid) {
      throw new Error('not-current-owner');
    }

    transaction.delete(CURRENT_COMPETITOR);
    transaction.set(RESULT_RUN(runId), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export async function syncStartBuffer({ currentCompetitor, clicks, actor }) {
  if (!currentCompetitor?.runId || clicks.length === 0) return null;
  log.info('syncStartBuffer start', {
    runId: currentCompetitor?.runId,
    clickCount: clicks.length,
    actor,
  });
  await assertStationOwned('start', actor.uid);

  const officialStart = clicks[0];
  const batch = writeBatch(db);
  const latestStart = clicks[clicks.length - 1];

  clicks.forEach((click) => {
    batch.set(RESULT_EVENT(click.clickId), {
      clickId: click.clickId,
      runId: currentCompetitor.runId,
      startId: currentCompetitor.startId,
      courseId: currentCompetitor.courseId,
      courseLabel: currentCompetitor.courseLabel,
      participantId: currentCompetitor.participantId,
      participantLabel: currentCompetitor.participantLabel,
      type: 'start',
      station: 'start',
      active: true,
      actorUid: actor.uid,
      actorEmail: actor.email ?? '',
      actorProviderId: actor.providerId ?? 'anonymous',
      clickedAtClientMs: click.clickedAtClientMs,
      clickedAtClientIso: click.clickedAtClientIso,
      syncedAtServer: serverTimestamp(),
    }, { merge: true });
  });

  batch.set(RESULT_RUN(currentCompetitor.runId), {
    status: 'running',
    startId: currentCompetitor.startId,
    courseId: currentCompetitor.courseId,
    courseLabel: currentCompetitor.courseLabel,
    participantId: currentCompetitor.participantId,
    participantLabel: currentCompetitor.participantLabel,
    officialStartClickId: officialStart.clickId,
    officialStartAtClientMs: officialStart.clickedAtClientMs,
    officialStartAtClientIso: officialStart.clickedAtClientIso,
    latestStartClickId: latestStart.clickId,
    latestStartAtClientMs: latestStart.clickedAtClientMs,
    latestStartAtClientIso: latestStart.clickedAtClientIso,
    startClickCount: clicks.length,
    pendingStartClicks: [],
    startedByUid: actor.uid,
    startedByEmail: actor.email ?? '',
    startedAtServer: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  batch.set(CURRENT_COMPETITOR, {
    ...currentCompetitor,
    status: 'running',
    officialStartClickId: officialStart.clickId,
    officialStartAtClientMs: officialStart.clickedAtClientMs,
    officialStartAtClientIso: officialStart.clickedAtClientIso,
    latestStartClickId: latestStart.clickId,
    latestStartAtClientMs: latestStart.clickedAtClientMs,
    latestStartAtClientIso: latestStart.clickedAtClientIso,
    startClickCount: clicks.length,
    pendingStartClicks: [],
    startedByUid: actor.uid,
    startedByEmail: actor.email ?? '',
    startedAtServer: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await batch.commit();
  return officialStart;
}

export async function mirrorPendingStartClicks({ currentCompetitor, clicks, actor }) {
  if (!currentCompetitor?.runId) return;
  await assertStationOwned('start', actor.uid);
  const latestStart = clicks[clicks.length - 1] ?? null;

  log.info('mirrorPendingStartClicks', {
    runId: currentCompetitor.runId,
    clickCount: clicks.length,
    latestStart,
    actor,
  });

  const payload = {
    pendingStartClicks: clicks,
    latestStartClickId: latestStart?.clickId ?? null,
    latestStartAtClientMs: latestStart?.clickedAtClientMs ?? null,
    latestStartAtClientIso: latestStart?.clickedAtClientIso ?? null,
    startClickCount: clicks.length,
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(CURRENT_COMPETITOR, payload, { merge: true });
  batch.set(RESULT_RUN(currentCompetitor.runId), payload, { merge: true });
  await batch.commit();
}

function hasLocalStart(current) {
  return Number.isFinite(current?.latestStartAtClientMs);
}

function getStartReference(current) {
  return {
    clickId: current?.officialStartClickId || current?.latestStartClickId || null,
    clickedAtClientMs: current?.officialStartAtClientMs ?? current?.latestStartAtClientMs ?? null,
    clickedAtClientIso: current?.officialStartAtClientIso ?? current?.latestStartAtClientIso ?? null,
  };
}

export async function completeCurrentCompetitor({ actor, click }) {
  log.info('completeCurrentCompetitor start', { actor, click });
  await assertStationOwned('finish', actor.uid);
  const currentSnap = await getDoc(CURRENT_COMPETITOR);
  if (!currentSnap.exists()) {
    throw new Error('no-current-competitor');
  }

  const current = currentSnap.data();
  if (!hasLocalStart(current)) {
    throw new Error('start-not-synced');
  }

  const startReference = getStartReference(current);

  const durationMs = Number.isFinite(startReference.clickedAtClientMs)
    ? Math.max(0, click.clickedAtClientMs - startReference.clickedAtClientMs)
    : null;

  const durationLabel = durationMs == null ? null : formatDurationMs(durationMs);
  const batch = writeBatch(db);

  if (!current.officialStartClickId && startReference.clickId) {
    batch.set(RESULT_EVENT(startReference.clickId), {
      clickId: startReference.clickId,
      runId: current.runId,
      startId: current.startId,
      courseId: current.courseId,
      courseLabel: current.courseLabel,
      participantId: current.participantId,
      participantLabel: current.participantLabel,
      type: 'start',
      station: 'start',
      active: true,
      actorUid: current.selectedByUid || '',
      actorEmail: current.selectedByEmail || '',
      actorProviderId: current.selectedByProviderId || 'anonymous',
      clickedAtClientMs: startReference.clickedAtClientMs,
      clickedAtClientIso: startReference.clickedAtClientIso,
      syncedAtServer: serverTimestamp(),
    }, { merge: true });
  }

  batch.set(RESULT_EVENT(click.clickId), {
    clickId: click.clickId,
    runId: current.runId,
    startId: current.startId,
    courseId: current.courseId,
    courseLabel: current.courseLabel,
    participantId: current.participantId,
    participantLabel: current.participantLabel,
    type: 'finish',
    station: 'finish',
    active: true,
    actorUid: actor.uid,
    actorEmail: actor.email ?? '',
    actorProviderId: actor.providerId ?? 'anonymous',
    clickedAtClientMs: click.clickedAtClientMs,
    clickedAtClientIso: click.clickedAtClientIso,
    syncedAtServer: serverTimestamp(),
  }, { merge: true });

  batch.set(RESULT_RUN(current.runId), {
    status: 'finished',
    startId: current.startId,
    courseId: current.courseId,
    courseLabel: current.courseLabel,
    participantId: current.participantId,
    participantLabel: current.participantLabel,
    officialStartClickId: current.officialStartClickId || startReference.clickId,
    officialStartAtClientMs: current.officialStartAtClientMs || startReference.clickedAtClientMs,
    officialStartAtClientIso: current.officialStartAtClientIso || startReference.clickedAtClientIso,
    latestStartClickId: startReference.clickId,
    latestStartAtClientMs: startReference.clickedAtClientMs,
    latestStartAtClientIso: startReference.clickedAtClientIso,
    finishClickId: click.clickId,
    finishAtClientMs: click.clickedAtClientMs,
    finishAtClientIso: click.clickedAtClientIso,
    startedByUid: current.startedByUid || current.selectedByUid || '',
    startedByEmail: current.startedByEmail || current.selectedByEmail || '',
    finishedByUid: actor.uid,
    finishedByEmail: actor.email ?? '',
    finishedAtServer: serverTimestamp(),
    durationMs,
    durationLabel,
    pendingStartClicks: [],
    updatedAt: serverTimestamp(),
  }, { merge: true });

  batch.delete(CURRENT_COMPETITOR);
  await batch.commit();

  return {
    ...current,
    finishClickId: click.clickId,
    finishAtClientMs: click.clickedAtClientMs,
    durationMs,
    durationLabel,
  };
}

export async function abandonCurrentCompetitor({ actor, click }) {
  log.info('abandonCurrentCompetitor start', { actor, click });
  await assertStationOwned('finish', actor.uid);
  const currentSnap = await getDoc(CURRENT_COMPETITOR);
  if (!currentSnap.exists()) {
    throw new Error('no-current-competitor');
  }

  const current = currentSnap.data();
  if (current.status !== 'running' || !hasLocalStart(current)) {
    throw new Error('start-not-synced');
  }

  const startReference = getStartReference(current);

  const batch = writeBatch(db);

  batch.set(RESULT_EVENT(click.clickId), {
    clickId: click.clickId,
    runId: current.runId,
    startId: current.startId,
    courseId: current.courseId,
    courseLabel: current.courseLabel,
    participantId: current.participantId,
    participantLabel: current.participantLabel,
    type: 'abandon',
    station: 'finish',
    active: true,
    actorUid: actor.uid,
    actorEmail: actor.email ?? '',
    actorProviderId: actor.providerId ?? 'anonymous',
    clickedAtClientMs: click.clickedAtClientMs,
    clickedAtClientIso: click.clickedAtClientIso,
    syncedAtServer: serverTimestamp(),
  }, { merge: true });

  batch.set(RESULT_RUN(current.runId), {
    status: 'abandoned',
    startId: current.startId,
    courseId: current.courseId,
    courseLabel: current.courseLabel,
    participantId: current.participantId,
    participantLabel: current.participantLabel,
    officialStartClickId: current.officialStartClickId || startReference.clickId,
    officialStartAtClientMs: current.officialStartAtClientMs || startReference.clickedAtClientMs,
    officialStartAtClientIso: current.officialStartAtClientIso || startReference.clickedAtClientIso,
    latestStartClickId: startReference.clickId,
    latestStartAtClientMs: startReference.clickedAtClientMs,
    latestStartAtClientIso: startReference.clickedAtClientIso,
    abandonClickId: click.clickId,
    abandonAtClientMs: click.clickedAtClientMs,
    abandonAtClientIso: click.clickedAtClientIso,
    abandonedByUid: actor.uid,
    abandonedByEmail: actor.email ?? '',
    abandonedAtServer: serverTimestamp(),
    durationMs: null,
    durationLabel: null,
    pendingStartClicks: [],
    updatedAt: serverTimestamp(),
  }, { merge: true });

  batch.delete(CURRENT_COMPETITOR);
  await batch.commit();

  return {
    ...current,
    abandonClickId: click.clickId,
    abandonAtClientMs: click.clickedAtClientMs,
    status: 'abandoned',
  };
}

export async function verifyBrowserClock(uid) {
  log.info('verifyBrowserClock start', { uid });
  const startedAt = Date.now();
  await setDoc(CLOCK_CHECK(uid), {
    uid,
    checkedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  const snap = await getDoc(CLOCK_CHECK(uid));
  const finishedAt = Date.now();
  const serverNow = snap.data()?.checkedAt?.toMillis?.();
  if (!serverNow) {
    throw new Error('clock-check-failed');
  }

  const clientMidpoint = Math.round((startedAt + finishedAt) / 2);
  return {
    serverNow,
    clientNow: clientMidpoint,
    driftMs: serverNow - clientMidpoint,
  };
}

export function subscribeResultRuns(onData) {
  return onSnapshot(
    query(collection(db, 'resultRuns'), orderBy('updatedAt', 'desc')),
    (snap) => {
      const runs = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      log.debug('resultRuns snapshot', { count: runs.length });
      onData(runs);
    },
    (error) => {
      log.error('resultRuns subscription failed', error);
    },
  );
}

export function toggleResultEventActive(eventId, active) {
  log.info('toggleResultEventActive', { eventId, active });
  return updateDoc(RESULT_EVENT(eventId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function toggleResultRunActive({
  runId,
  officialStartClickId,
  latestStartClickId,
  finishClickId,
  abandonClickId,
  active,
}) {
  log.info('toggleResultRunActive', {
    runId,
    officialStartClickId,
    latestStartClickId,
    finishClickId,
    abandonClickId,
    active,
  });

  if (!runId) {
    throw new Error('admin-run-missing-run-id');
  }

  const eventIds = [...new Set([
    officialStartClickId,
    latestStartClickId,
    finishClickId,
    abandonClickId,
  ].filter(Boolean))];

  const batch = writeBatch(db);
  batch.set(RESULT_RUN(runId), {
    active,
    adminEditedAtServer: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  eventIds.forEach((eventId) => {
    batch.set(RESULT_EVENT(eventId), {
      active,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();
}

export async function upsertAdminRun({
  runId,
  startId,
  courseId,
  courseLabel,
  participantId,
  participantLabel,
  startAtClientMs,
  terminalAtClientMs,
  status = 'finished',
  actor,
}) {
  log.info('upsertAdminRun start', {
    runId,
    startId,
    courseId,
    courseLabel,
    participantId,
    participantLabel,
    startAtClientMs,
    terminalAtClientMs,
    status,
    actor,
  });

  if (!courseId || !courseLabel || !participantLabel) {
    throw new Error('admin-run-missing-fields');
  }
  if (!['finished', 'abandoned'].includes(status)) {
    throw new Error('admin-run-invalid-status');
  }
  if (!Number.isFinite(startAtClientMs) || !Number.isFinite(terminalAtClientMs) || terminalAtClientMs <= startAtClientMs) {
    throw new Error('admin-run-invalid-times');
  }

  const nextRunId = runId || createAdminEntityId('admin-run');
  const nextStartId = startId || nextRunId;
  const startClickId = createAdminEntityId(`admin-start-${nextRunId}`);
  const terminalClickId = createAdminEntityId(`admin-${status === 'abandoned' ? 'abandon' : 'finish'}-${nextRunId}`);
  const startAtClientIso = new Date(startAtClientMs).toISOString();
  const terminalAtClientIso = new Date(terminalAtClientMs).toISOString();
  const durationMs = status === 'finished' ? terminalAtClientMs - startAtClientMs : null;
  const durationLabel = durationMs == null ? null : formatDurationMs(durationMs);

  const existingEvents = await getDocs(query(collection(db, 'resultEvents'), where('runId', '==', nextRunId)));
  const batch = writeBatch(db);

  existingEvents.docs.forEach((entry) => {
    batch.set(entry.ref, {
      active: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  batch.set(RESULT_EVENT(startClickId), {
    clickId: startClickId,
    runId: nextRunId,
    startId: nextStartId,
    courseId,
    courseLabel,
    participantId: participantId || '',
    participantLabel,
    type: 'start',
    station: 'start',
    active: true,
    actorUid: actor.uid,
    actorEmail: actor.email ?? '',
    actorProviderId: actor.providerId ?? 'google.com',
    clickedAtClientMs: startAtClientMs,
    clickedAtClientIso: startAtClientIso,
    syncedAtServer: serverTimestamp(),
    adminEditedAtServer: serverTimestamp(),
  }, { merge: true });

  batch.set(RESULT_EVENT(terminalClickId), {
    clickId: terminalClickId,
    runId: nextRunId,
    startId: nextStartId,
    courseId,
    courseLabel,
    participantId: participantId || '',
    participantLabel,
    type: status === 'abandoned' ? 'abandon' : 'finish',
    station: 'finish',
    active: true,
    actorUid: actor.uid,
    actorEmail: actor.email ?? '',
    actorProviderId: actor.providerId ?? 'google.com',
    clickedAtClientMs: terminalAtClientMs,
    clickedAtClientIso: terminalAtClientIso,
    syncedAtServer: serverTimestamp(),
    adminEditedAtServer: serverTimestamp(),
  }, { merge: true });

  batch.set(RESULT_RUN(nextRunId), {
    runId: nextRunId,
    startId: nextStartId,
    courseId,
    courseLabel,
    participantId: participantId || '',
    participantLabel,
    active: true,
    status,
    officialStartClickId: startClickId,
    officialStartAtClientMs: startAtClientMs,
    officialStartAtClientIso: startAtClientIso,
    latestStartClickId: startClickId,
    latestStartAtClientMs: startAtClientMs,
    latestStartAtClientIso: startAtClientIso,
    finishClickId: status === 'finished' ? terminalClickId : deleteField(),
    finishAtClientMs: status === 'finished' ? terminalAtClientMs : deleteField(),
    finishAtClientIso: status === 'finished' ? terminalAtClientIso : deleteField(),
    abandonClickId: status === 'abandoned' ? terminalClickId : deleteField(),
    abandonAtClientMs: status === 'abandoned' ? terminalAtClientMs : deleteField(),
    abandonAtClientIso: status === 'abandoned' ? terminalAtClientIso : deleteField(),
    startedByUid: actor.uid,
    startedByEmail: actor.email ?? '',
    finishedByUid: status === 'finished' ? actor.uid : deleteField(),
    finishedByEmail: status === 'finished' ? actor.email ?? '' : deleteField(),
    finishedAtServer: status === 'finished' ? serverTimestamp() : deleteField(),
    abandonedByUid: status === 'abandoned' ? actor.uid : deleteField(),
    abandonedByEmail: status === 'abandoned' ? actor.email ?? '' : deleteField(),
    abandonedAtServer: status === 'abandoned' ? serverTimestamp() : deleteField(),
    durationMs,
    durationLabel,
    pendingStartClicks: [],
    adminEditedAtServer: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await batch.commit();
  return {
    runId: nextRunId,
    startId: nextStartId,
    courseId,
    courseLabel,
    participantId: participantId || '',
    participantLabel,
    startAtClientMs,
    terminalAtClientMs,
    status,
  };
}

export async function upsertAdminFinishedRun({
  finishAtClientMs,
  ...rest
}) {
  return upsertAdminRun({
    ...rest,
    status: 'finished',
    terminalAtClientMs: finishAtClientMs,
  });
}

export async function exportCourseArchive(courseId) {
  log.info('exportCourseArchive start', { courseId });
  const [resultEvents, resultRuns, currentSnap, startStationSnap, finishStationSnap] = await Promise.all([
    getCourseDocs('resultEvents', courseId),
    getCourseDocs('resultRuns', courseId),
    getDoc(CURRENT_COMPETITOR),
    getDoc(RESULT_STATION('start')),
    getDoc(RESULT_STATION('finish')),
  ]);

  const currentCompetitor = currentSnap.exists() && currentSnap.data().courseId === courseId
    ? { id: currentSnap.id, ...currentSnap.data() }
    : null;

  const startStation = startStationSnap.exists() && startStationSnap.data().currentCourseId === courseId
    ? { id: startStationSnap.id, ...startStationSnap.data() }
    : null;
  const finishStation = finishStationSnap.exists()
    ? { id: finishStationSnap.id, ...finishStationSnap.data() }
    : null;

  const courseLabel =
    resultRuns[0]?.courseLabel
    || resultEvents[0]?.courseLabel
    || currentCompetitor?.courseLabel
    || startStation?.currentCourseLabel
    || courseId;

  const payload = {
    archiveType: RESULT_ARCHIVE_MODEL.name,
    exportedAt: new Date().toISOString(),
    model: RESULT_ARCHIVE_MODEL,
    course: {
      courseId,
      courseLabel,
    },
    data: serializeValue({
      resultEvents,
      resultRuns,
      currentCompetitor,
      startStation,
      finishStation,
    }),
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = createSingleFileZip(RESULT_ARCHIVE_FILENAME, json);
  return {
    blob,
    filename: `${courseLabel || courseId}.zip`.replace(/[^\w.-]+/g, '_'),
  };
}

export async function deleteCourseData(courseId) {
  log.info('deleteCourseData start', { courseId });
  const [resultEvents, resultRuns, currentSnap, startStationSnap] = await Promise.all([
    getDocs(query(collection(db, 'resultEvents'), where('courseId', '==', courseId))),
    getDocs(query(collection(db, 'resultRuns'), where('courseId', '==', courseId))),
    getDoc(CURRENT_COMPETITOR),
    getDoc(RESULT_STATION('start')),
  ]);

  const batch = writeBatch(db);
  resultEvents.docs.forEach((entry) => batch.delete(entry.ref));
  resultRuns.docs.forEach((entry) => batch.delete(entry.ref));

  if (currentSnap.exists() && currentSnap.data().courseId === courseId) {
    batch.delete(CURRENT_COMPETITOR);
  }

  if (startStationSnap.exists() && startStationSnap.data().currentCourseId === courseId) {
    batch.set(RESULT_STATION('start'), {
      currentCourseId: null,
      currentCourseLabel: '',
      currentCourseUpdatedAt: deleteField(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
}

export async function deleteAllResultsData() {
  log.info('deleteAllResultsData start');
  const [allEvents, allRuns, allStations, allCurrentStations, currentSnap, allParticipants, allLightUsers, allLightRequests] = await Promise.all([
    getDocs(collection(db, 'resultEvents')),
    getDocs(collection(db, 'resultRuns')),
    getDocs(collection(db, 'resultStations')),
    getDocs(collection(db, 'currentStations')),
    getDoc(CURRENT_COMPETITOR),
    getDocs(collection(db, 'participants')),
    getDocs(collection(db, 'allowedResultUsers')),
    getDocs(collection(db, 'resultAccessRequests')),
  ]);

  const batch = writeBatch(db);
  allEvents.docs.forEach((entry) => batch.delete(entry.ref));
  allRuns.docs.forEach((entry) => batch.delete(entry.ref));
  allStations.docs.forEach((entry) => batch.delete(entry.ref));
  allCurrentStations.docs.forEach((entry) => batch.delete(entry.ref));
  allParticipants.docs.forEach((entry) => batch.delete(entry.ref));
  allLightUsers.docs.forEach((entry) => batch.delete(entry.ref));
  allLightRequests.docs.forEach((entry) => batch.delete(entry.ref));

  if (currentSnap.exists()) {
    batch.delete(CURRENT_COMPETITOR);
  }

  batch.set(STREAMS_REF, { streams: [] });
  await batch.commit();
}

export async function exportAllResultsArchive() {
  log.info('exportAllResultsArchive start');
  const [resultEvents, resultRuns, currentSnap, stationSnaps, currentStationSnaps, participants, streamsSnap, allowedResultUsers, resultAccessRequests] = await Promise.all([
    getAllDocs('resultEvents'),
    getAllDocs('resultRuns'),
    getDoc(CURRENT_COMPETITOR),
    getDocs(collection(db, 'resultStations')),
    getDocs(collection(db, 'currentStations')),
    getAllDocs('participants'),
    getDoc(STREAMS_REF),
    getAllDocs('allowedResultUsers'),
    getAllDocs('resultAccessRequests'),
  ]);

  const stations = stationSnaps.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  const currentStations = currentStationSnaps.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  const streams = streamsSnap.exists() ? (streamsSnap.data().streams ?? []) : [];
  const payload = {
    archiveType: RESULT_ARCHIVE_MODEL.name,
    exportedAt: new Date().toISOString(),
    model: RESULT_ARCHIVE_MODEL,
    scope: 'all',
    data: serializeValue({
      resultEvents,
      resultRuns,
      currentCompetitor: currentSnap.exists() ? { id: currentSnap.id, ...currentSnap.data() } : null,
      resultStations: stations,
      currentStations,
      participants,
      streams,
      allowedResultUsers,
      resultAccessRequests,
    }),
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = createSingleFileZip(RESULT_ARCHIVE_FILENAME, json);
  return {
    blob,
    filename: 'direct-diffusion-results-all.zip',
  };
}

export async function restoreCourseArchive(fileOrBlob) {
  log.info('restoreCourseArchive start');
  const { filename, content } = await readSingleFileZip(fileOrBlob);
  if (filename !== RESULT_ARCHIVE_FILENAME) {
    throw new Error('archive-invalid-file');
  }

  const parsed = JSON.parse(content);
  if (parsed.archiveType !== RESULT_ARCHIVE_MODEL.name) {
    throw new Error('archive-invalid-type');
  }

  const archiveVersion = Number(parsed?.model?.version);
  if (archiveVersion !== RESULT_ARCHIVE_MODEL_VERSION) {
    throw new Error(`archive-version-mismatch:${archiveVersion}`);
  }

  const data = deserializeValue(parsed.data ?? {});
  const batch = writeBatch(db);
  const scope = parsed.scope || 'course';

  if (scope === 'all') {
    const [allEvents, allRuns, allStations, allCurrentStations, currentSnap, allParticipants, allLightUsers, allLightRequests] = await Promise.all([
      getDocs(collection(db, 'resultEvents')),
      getDocs(collection(db, 'resultRuns')),
      getDocs(collection(db, 'resultStations')),
      getDocs(collection(db, 'currentStations')),
      getDoc(CURRENT_COMPETITOR),
      getDocs(collection(db, 'participants')),
      getDocs(collection(db, 'allowedResultUsers')),
      getDocs(collection(db, 'resultAccessRequests')),
    ]);
    allEvents.docs.forEach((entry) => batch.delete(entry.ref));
    allRuns.docs.forEach((entry) => batch.delete(entry.ref));
    allStations.docs.forEach((entry) => batch.delete(entry.ref));
    allCurrentStations.docs.forEach((entry) => batch.delete(entry.ref));
    allParticipants.docs.forEach((entry) => batch.delete(entry.ref));
    allLightUsers.docs.forEach((entry) => batch.delete(entry.ref));
    allLightRequests.docs.forEach((entry) => batch.delete(entry.ref));
    if (currentSnap.exists()) {
      batch.delete(CURRENT_COMPETITOR);
    }
    batch.set(STREAMS_REF, { streams: [] });
  }

  (data.resultEvents ?? []).forEach((entry) => {
    const { id, ...payload } = entry;
    batch.set(RESULT_EVENT(id), payload);
  });

  (data.resultRuns ?? []).forEach((entry) => {
    const { id, ...payload } = entry;
    batch.set(RESULT_RUN(id), payload);
  });

  if (data.currentCompetitor?.id) {
    const { id, ...payload } = data.currentCompetitor;
    batch.set(CURRENT_COMPETITOR, payload);
  }

  if (Array.isArray(data.resultStations)) {
    data.resultStations.forEach((station) => {
      const { id, ...payload } = station;
      batch.set(RESULT_STATION(id), payload, { merge: true });
    });
  } else {
    if (data.startStation?.id === 'start') {
      const { id, ...payload } = data.startStation;
      batch.set(RESULT_STATION('start'), payload, { merge: true });
    }
    if (data.finishStation?.id === 'finish') {
      const { id, ...payload } = data.finishStation;
      batch.set(RESULT_STATION('finish'), payload, { merge: true });
    }
  }

  if (Array.isArray(data.currentStations)) {
    data.currentStations.forEach((station) => {
      const { id, ...payload } = station;
      batch.set(doc(db, 'currentStations', id), payload, { merge: true });
    });
  }

  if (scope === 'all') {
    (data.participants ?? []).forEach((entry) => {
      const { id, ...payload } = entry;
      batch.set(PARTICIPANT(id), payload);
    });

    (data.allowedResultUsers ?? []).forEach((entry) => {
      const { id, ...payload } = entry;
      batch.set(RESULT_ACCESS(id), payload);
    });

    (data.resultAccessRequests ?? []).forEach((entry) => {
      const { id, ...payload } = entry;
      batch.set(RESULT_REQUEST(id), payload);
    });

    batch.set(STREAMS_REF, {
      streams: data.streams ?? [],
    });
  }

  await batch.commit();
  return {
    courseId: parsed.course?.courseId ?? null,
    courseLabel: parsed.course?.courseLabel ?? null,
    scope,
    version: archiveVersion,
  };
}
