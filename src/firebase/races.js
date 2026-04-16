import {
  collection, onSnapshot, addDoc, deleteDoc, updateDoc,
  doc, query, orderBy, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('firebase/races');

// ── Races ─────────────────────────────────────────────────────────────────────

export function subscribeRaces(onData) {
  return onSnapshot(
    query(collection(db, 'races'), orderBy('createdAt', 'desc')),
    (snap) => {
      const races = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      log.debug('races snapshot', { count: races.length });
      onData(races);
    },
    (error) => {
      log.error('races subscription failed', error);
    },
  );
}

export const addRace = (number) =>
  (log.info('addRace', { number }), addDoc(collection(db, 'races'), { number, createdAt: serverTimestamp() }));

export const deleteRace   = (raceId) => (log.info('deleteRace', { raceId }), deleteDoc(doc(db, 'races', raceId)));
export const finishRace   = (raceId) => (log.info('finishRace', { raceId }), updateDoc(doc(db, 'races', raceId), { finished: true }));
export const reopenRace   = (raceId) => (log.info('reopenRace', { raceId }), updateDoc(doc(db, 'races', raceId), { finished: false }));

/** Fetch all results for a race (one-shot read). */
export async function fetchResults(raceId) {
  log.info('fetchResults', { raceId });
  const snap = await getDocs(
    query(collection(db, 'races', raceId, 'results'), orderBy('addedAt', 'asc')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Results (sub-collection of a race) ───────────────────────────────────────

export function subscribeResults(raceId, onData) {
  return onSnapshot(
    query(collection(db, 'races', raceId, 'results'), orderBy('addedAt', 'asc')),
    (snap) => {
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      log.debug('results snapshot', { raceId, count: results.length });
      onData(results);
    },
    (error) => {
      log.error('results subscription failed', { raceId, error });
    },
  );
}

export const addResult = (raceId, data) =>
  (log.info('addResult', { raceId, data }), addDoc(collection(db, 'races', raceId, 'results'), { ...data, addedAt: serverTimestamp() }));

export const deleteResult = (raceId, resultId) =>
  (log.info('deleteResult', { raceId, resultId }), deleteDoc(doc(db, 'races', raceId, 'results', resultId)));
