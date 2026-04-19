import { onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { eventConfigDoc, eventSubdoc } from './eventRefs';
import { createLogger } from '../utils/logger';

const log = createLogger('firebase/streams');

/**
 * Returns the user's roles document if they are in allowedUsers, or null.
 * The document fields: { administration?: true, admin_flux?: true, participants?: true, results?: true }
 * Mere existence = basic access.
 */
export async function getUserRoles(eventId, email) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('getUserRoles start', { eventId, email: normalizedEmail });
  const snap = await getDoc(eventSubdoc(eventId, 'allowedUsers', normalizedEmail));
  if (!snap.exists()) return null;
  const data = snap.data();
  log.info('getUserRoles found document', { eventId, email: normalizedEmail, data });
  return data;
}

/**
 * Subscribe to Firestore streams in real time.
 * Calls onData([...]) immediately (cached) and on every change.
 * Returns the unsubscribe function.
 */
export function subscribeStreams(eventId, onData) {
  return onSnapshot(eventConfigDoc(eventId), (snap) => {
    const streams = snap.exists() ? (snap.data().streams ?? []) : [];
    log.debug('streams snapshot', { eventId, count: streams.length });
    onData(streams);
  }, (error) => {
    log.error('streams subscription failed', { eventId, error });
  });
}

/** Overwrite all streams in Firestore. */
export function saveStreams(eventId, streams) {
  log.info('saveStreams', { eventId, count: streams.length });
  return setDoc(eventConfigDoc(eventId), { streams });
}

/**
 * Write streams to Firestore only if no streams exist yet.
 * Used to seed the DB from streams.json on first run.
 */
export async function seedStreamsIfEmpty(eventId, streams) {
  log.info('seedStreamsIfEmpty check', { eventId, count: streams.length });
  const snap = await getDoc(eventConfigDoc(eventId));
  if (!snap.exists() || !(snap.data().streams?.length)) {
    log.info('seedStreamsIfEmpty writing seed data', { eventId, count: streams.length });
    await setDoc(eventConfigDoc(eventId), { streams });
  } else {
    log.debug('seedStreamsIfEmpty skipped, data already present', { eventId });
  }
}
