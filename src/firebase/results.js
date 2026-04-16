import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { formatDurationMs } from '../utils/resultsBuffer';
import { createLogger } from '../utils/logger';

const RESULT_ACCESS = (uid) => doc(db, 'allowedResultUsers', uid);
const RESULT_REQUEST = (uid) => doc(db, 'resultAccessRequests', uid);
const RESULT_STATION = (station) => doc(db, 'resultStations', station);
const CURRENT_COMPETITOR = doc(db, 'currentCompetitor', 'current');
const RESULT_EVENT = (eventId) => doc(db, 'resultEvents', eventId);
const RESULT_RUN = (runId) => doc(db, 'resultRuns', runId);
const CLOCK_CHECK = (uid) => doc(db, 'clockChecks', uid);
const log = createLogger('firebase/results');

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
  return setDoc(
    RESULT_ACCESS(uid),
    {
      uid,
      email: (data.email ?? '').trim().toLowerCase(),
      results_start: !!data.results_start,
      results_finish: !!data.results_finish,
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

export async function claimStation(station, actor) {
  log.info('claimStation start', { station, actor });
  await runTransaction(db, async (transaction) => {
    const ref = RESULT_STATION(station);
    const snap = await transaction.get(ref);
    if (snap.exists()) {
      const current = snap.data();
      if (current.assignedUid && current.assignedUid !== actor.uid) {
        throw new Error('station-occupied');
      }
    }

    transaction.set(ref, {
      station,
      assignedUid: actor.uid,
      assignedEmail: actor.email ?? '',
      assignedProviderId: actor.providerId ?? 'anonymous',
      updatedAt: serverTimestamp(),
      assignedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export async function releaseStation(station, uid) {
  log.info('releaseStation start', { station, uid });
  await runTransaction(db, async (transaction) => {
    const ref = RESULT_STATION(station);
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    if (snap.data().assignedUid !== uid) return;
    transaction.delete(ref);
  });
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

export async function armCurrentCompetitor({ participant, actor, runId, selectedAtClientMs }) {
  log.info('armCurrentCompetitor start', {
    participantId: participant.id,
    participantLabel: participant.label,
    actor,
    runId,
    selectedAtClientMs,
  });
  const selectedAtClientIso = new Date(selectedAtClientMs).toISOString();

  await runTransaction(db, async (transaction) => {
    const currentSnap = await transaction.get(CURRENT_COMPETITOR);
    if (currentSnap.exists()) {
      throw new Error('current-competitor-busy');
    }

    transaction.set(CURRENT_COMPETITOR, {
      runId,
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

  const officialStart = clicks[0];
  const batch = writeBatch(db);

  clicks.forEach((click) => {
    batch.set(RESULT_EVENT(click.clickId), {
      clickId: click.clickId,
      runId: currentCompetitor.runId,
      participantId: currentCompetitor.participantId,
      participantLabel: currentCompetitor.participantLabel,
      type: 'start',
      station: 'start',
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
    participantId: currentCompetitor.participantId,
    participantLabel: currentCompetitor.participantLabel,
    officialStartClickId: officialStart.clickId,
    officialStartAtClientMs: officialStart.clickedAtClientMs,
    officialStartAtClientIso: officialStart.clickedAtClientIso,
    startClickCount: clicks.length,
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
    startClickCount: clicks.length,
    startedByUid: actor.uid,
    startedByEmail: actor.email ?? '',
    startedAtServer: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await batch.commit();
  return officialStart;
}

export async function completeCurrentCompetitor({ actor, click }) {
  log.info('completeCurrentCompetitor start', { actor, click });
  const currentSnap = await getDoc(CURRENT_COMPETITOR);
  if (!currentSnap.exists()) {
    throw new Error('no-current-competitor');
  }

  const current = currentSnap.data();
  const durationMs = Number.isFinite(current.officialStartAtClientMs)
    ? Math.max(0, click.clickedAtClientMs - current.officialStartAtClientMs)
    : null;

  const durationLabel = durationMs == null ? null : formatDurationMs(durationMs);
  const batch = writeBatch(db);

  batch.set(RESULT_EVENT(click.clickId), {
    clickId: click.clickId,
    runId: current.runId,
    participantId: current.participantId,
    participantLabel: current.participantLabel,
    type: 'finish',
    station: 'finish',
    actorUid: actor.uid,
    actorEmail: actor.email ?? '',
    actorProviderId: actor.providerId ?? 'anonymous',
    clickedAtClientMs: click.clickedAtClientMs,
    clickedAtClientIso: click.clickedAtClientIso,
    syncedAtServer: serverTimestamp(),
  }, { merge: true });

  batch.set(RESULT_RUN(current.runId), {
    status: 'finished',
    participantId: current.participantId,
    participantLabel: current.participantLabel,
    finishClickId: click.clickId,
    finishAtClientMs: click.clickedAtClientMs,
    finishAtClientIso: click.clickedAtClientIso,
    finishedByUid: actor.uid,
    finishedByEmail: actor.email ?? '',
    finishedAtServer: serverTimestamp(),
    durationMs,
    durationLabel,
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
