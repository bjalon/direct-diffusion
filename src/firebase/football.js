import {
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { eventSubcollection, eventSubdoc } from './eventRefs';
import { createLogger } from '../utils/logger';
import { normalizeFootballRoles } from '../utils/football';

const log = createLogger('firebase/football');

const FOOTBALL_ACCESS = (eventId, uid) => eventSubdoc(eventId, 'allowedFootballUsers', uid);
const FOOTBALL_REQUEST = (eventId, uid) => eventSubdoc(eventId, 'footballAccessRequests', uid);
const FOOTBALL_MATCH = (eventId, matchId) => eventSubdoc(eventId, 'footballMatches', matchId);
const FOOTBALL_SCORE_STATION = (eventId, matchId) => eventSubdoc(eventId, 'footballStations', matchId);

export function subscribeFootballAccess(eventId, uid, onData) {
  if (!uid) {
    onData(null);
    return () => {};
  }

  return onSnapshot(FOOTBALL_ACCESS(eventId, uid), (snap) => {
    onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (error) => {
    log.error('football access subscription failed', { eventId, uid, error });
  });
}

export function subscribeFootballAccessRequest(eventId, uid, onData) {
  if (!uid) {
    onData(null);
    return () => {};
  }

  return onSnapshot(FOOTBALL_REQUEST(eventId, uid), (snap) => {
    onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (error) => {
    log.error('football access request subscription failed', { eventId, uid, error });
  });
}

export function submitFootballAccessRequest(eventId, { uid, email, providerId }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  log.info('submitFootballAccessRequest', { eventId, uid, email: normalizedEmail, providerId });
  return setDoc(FOOTBALL_REQUEST(eventId, uid), {
    uid,
    email: normalizedEmail,
    providerId: providerId ?? 'anonymous',
    status: 'pending',
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribePendingFootballAccessRequests(eventId, onData) {
  return onSnapshot(eventSubcollection(eventId, 'footballAccessRequests'), (snap) => {
    const requests = snap.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .filter((entry) => entry.status === 'pending')
      .sort((a, b) => (b.requestedAt?.toMillis?.() ?? 0) - (a.requestedAt?.toMillis?.() ?? 0));
    onData(requests);
  }, (error) => {
    log.error('football access requests subscription failed', { eventId, error });
  });
}

export function subscribeAllowedFootballUsers(eventId, onData) {
  return onSnapshot(eventSubcollection(eventId, 'allowedFootballUsers'), (snap) => {
    const users = snap.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '') || a.id.localeCompare(b.id));
    onData(users);
  }, (error) => {
    log.error('allowed football users subscription failed', { eventId, error });
  });
}

export function saveAllowedFootballUser(eventId, uid, data) {
  const roles = normalizeFootballRoles(data);
  log.info('saveAllowedFootballUser', { eventId, uid, roles });
  return setDoc(FOOTBALL_ACCESS(eventId, uid), {
    uid,
    email: (data.email ?? '').trim().toLowerCase(),
    ...roles,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function approveFootballAccessRequest(eventId, uid) {
  log.info('approveFootballAccessRequest', { eventId, uid });
  return getDoc(FOOTBALL_REQUEST(eventId, uid)).then((snap) => {
    const request = snap.exists() ? snap.data() : {};
    return saveAllowedFootballUser(eventId, uid, {
      uid,
      email: request.email ?? '',
      tv: false,
      score: false,
      commentator: false,
    }).then(() => updateDoc(FOOTBALL_REQUEST(eventId, uid), {
      status: 'approved',
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });
}

export function rejectFootballAccessRequest(eventId, uid) {
  log.info('rejectFootballAccessRequest', { eventId, uid });
  return updateDoc(FOOTBALL_REQUEST(eventId, uid), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function deleteAllowedFootballUser(eventId, uid) {
  log.info('deleteAllowedFootballUser', { eventId, uid });
  return deleteDoc(FOOTBALL_ACCESS(eventId, uid));
}

export function subscribeMatches(eventId, onData) {
  return onSnapshot(
    query(eventSubcollection(eventId, 'footballMatches'), orderBy('order', 'asc')),
    (snap) => {
      const matches = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      onData(matches);
    },
    (error) => {
      log.error('football matches subscription failed', { eventId, error });
    },
  );
}

export function createMatch(eventId, data) {
  log.info('createMatch', { eventId, data });
  return addDoc(eventSubcollection(eventId, 'footballMatches'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateMatch(eventId, matchId, data) {
  log.info('updateMatch', { eventId, matchId, data });
  return updateDoc(FOOTBALL_MATCH(eventId, matchId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export function deleteMatch(eventId, matchId) {
  log.info('deleteMatch', { eventId, matchId });
  return deleteDoc(FOOTBALL_MATCH(eventId, matchId));
}

export function subscribeFootballEvents(eventId, onData) {
  return onSnapshot(
    query(eventSubcollection(eventId, 'footballEvents'), orderBy('clickedAtClientMs', 'desc')),
    (snap) => {
      const events = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      onData(events);
    },
    (error) => {
      log.error('football events subscription failed', { eventId, error });
    },
  );
}

export function addGoalEvent(eventId, payload) {
  log.info('addGoalEvent', { eventId, matchId: payload.matchId, teamId: payload.teamId });
  return addDoc(eventSubcollection(eventId, 'footballEvents'), {
    type: 'goal',
    matchId: payload.matchId,
    teamId: payload.teamId,
    playerNumber: payload.playerNumber || '',
    ownGoal: !!payload.ownGoal,
    comment: payload.comment || '',
    clickedAtClientMs: payload.clickedAtClientMs,
    createdByUid: payload.createdByUid,
    createdByLabel: payload.createdByLabel || '',
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function addHighlightEvent(eventId, payload) {
  log.info('addHighlightEvent', { eventId, matchId: payload.matchId, code: payload.code });
  return addDoc(eventSubcollection(eventId, 'footballEvents'), {
    type: 'highlight',
    matchId: payload.matchId,
    teamId: payload.teamId || '',
    code: (payload.code || '').trim().slice(0, 5).toUpperCase(),
    comment: payload.comment || '',
    clickedAtClientMs: payload.clickedAtClientMs,
    createdByUid: payload.createdByUid,
    createdByLabel: payload.createdByLabel || '',
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeScoreStation(eventId, matchId, onData, onError) {
  if (!matchId) {
    onData(null);
    return () => {};
  }

  return onSnapshot(FOOTBALL_SCORE_STATION(eventId, matchId), (snap) => {
    onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (error) => {
    log.error('football score station subscription failed', { eventId, matchId, error });
    onError?.(error);
  });
}

export function subscribeScoreStations(eventId, onData, onError) {
  return onSnapshot(eventSubcollection(eventId, 'footballStations'), (snap) => {
    const scoreStations = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    onData(scoreStations);
  }, (error) => {
    log.error('football score stations subscription failed', { eventId, error });
    onError?.(error);
  });
}

export function claimScoreStation(eventId, matchId, { uid, email }) {
  log.info('claimScoreStation', { eventId, matchId, uid, email });
  return setDoc(FOOTBALL_SCORE_STATION(eventId, matchId), {
    station: 'score',
    matchId,
    assignedUid: uid,
    email: (email || '').trim().toLowerCase(),
    claimedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function releaseScoreStation(eventId, matchId) {
  log.info('releaseScoreStation', { eventId, matchId });
  return deleteDoc(FOOTBALL_SCORE_STATION(eventId, matchId));
}

export function releaseScoreStationAsAdmin(eventId, matchId) {
  log.info('releaseScoreStationAsAdmin', { eventId, matchId });
  return deleteDoc(FOOTBALL_SCORE_STATION(eventId, matchId));
}

export async function releaseOwnedScoreStations(eventId, uid) {
  log.info('releaseOwnedScoreStations', { eventId, uid });
  const snap = await getDocs(query(eventSubcollection(eventId, 'footballStations'), where('assignedUid', '==', uid)));
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((entry) => {
    batch.delete(entry.ref);
  });
  await batch.commit();
}
