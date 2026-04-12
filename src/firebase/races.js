import {
  collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── Races ─────────────────────────────────────────────────────────────────────

export function subscribeRaces(onData) {
  return onSnapshot(
    query(collection(db, 'races'), orderBy('createdAt', 'desc')),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  );
}

export const addRace = (number) =>
  addDoc(collection(db, 'races'), { number, createdAt: serverTimestamp() });

export const deleteRace = (raceId) =>
  deleteDoc(doc(db, 'races', raceId));

// ── Results (sub-collection of a race) ───────────────────────────────────────

export function subscribeResults(raceId, onData) {
  return onSnapshot(
    query(collection(db, 'races', raceId, 'results'), orderBy('addedAt', 'asc')),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  );
}

export const addResult = (raceId, data) =>
  addDoc(collection(db, 'races', raceId, 'results'), { ...data, addedAt: serverTimestamp() });

export const deleteResult = (raceId, resultId) =>
  deleteDoc(doc(db, 'races', raceId, 'results', resultId));
