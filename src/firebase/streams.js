import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('firebase/streams');

/**
 * Returns the user's roles document if they are in allowedUsers, or null.
 * The document fields: { administration?: true, admin_flux?: true, participants?: true, results?: true }
 * Mere existence = basic access.
 */
export async function getUserRoles(email) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('getUserRoles start', { email: normalizedEmail });
  const snap = await getDoc(doc(db, 'allowedUsers', normalizedEmail));
  if (!snap.exists()) return null;
  const data = snap.data();
  log.info('getUserRoles found document', { email: normalizedEmail, data });
  return data;
}

const STREAMS_REF = doc(db, 'config', 'streams');

/**
 * Subscribe to Firestore streams in real time.
 * Calls onData([...]) immediately (cached) and on every change.
 * Returns the unsubscribe function.
 */
export function subscribeStreams(onData) {
  return onSnapshot(STREAMS_REF, (snap) => {
    const streams = snap.exists() ? (snap.data().streams ?? []) : [];
    log.debug('streams snapshot', { count: streams.length });
    onData(streams);
  }, (error) => {
    log.error('streams subscription failed', error);
  });
}

/** Overwrite all streams in Firestore. */
export function saveStreams(streams) {
  log.info('saveStreams', { count: streams.length });
  return setDoc(STREAMS_REF, { streams });
}

/**
 * Write streams to Firestore only if no streams exist yet.
 * Used to seed the DB from streams.json on first run.
 */
export async function seedStreamsIfEmpty(streams) {
  log.info('seedStreamsIfEmpty check', { count: streams.length });
  const snap = await getDoc(STREAMS_REF);
  if (!snap.exists() || !(snap.data().streams?.length)) {
    log.info('seedStreamsIfEmpty writing seed data', { count: streams.length });
    await setDoc(STREAMS_REF, { streams });
  } else {
    log.debug('seedStreamsIfEmpty skipped, data already present');
  }
}
