import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Returns the user's roles document if they are in allowedUsers, or null.
 * The document fields: { admin_flux?: true, results?: true }
 * Mere existence = basic access.
 */
export async function getUserRoles(email) {
  const snap = await getDoc(doc(db, 'allowedUsers', email));
  if (!snap.exists()) return null;
  return snap.data();
}

const STREAMS_REF = doc(db, 'config', 'streams');

/**
 * Subscribe to Firestore streams in real time.
 * Calls onData([...]) immediately (cached) and on every change.
 * Returns the unsubscribe function.
 */
export function subscribeStreams(onData) {
  return onSnapshot(STREAMS_REF, (snap) => {
    onData(snap.exists() ? (snap.data().streams ?? []) : []);
  });
}

/** Overwrite all streams in Firestore. */
export function saveStreams(streams) {
  return setDoc(STREAMS_REF, { streams });
}

/**
 * Write streams to Firestore only if no streams exist yet.
 * Used to seed the DB from streams.json on first run.
 */
export async function seedStreamsIfEmpty(streams) {
  const snap = await getDoc(STREAMS_REF);
  if (!snap.exists() || !(snap.data().streams?.length)) {
    await setDoc(STREAMS_REF, { streams });
  }
}
