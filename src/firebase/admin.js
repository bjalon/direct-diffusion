import {
  deleteField,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { eventSubcollection, eventSubdoc } from './eventRefs';
import { createLogger } from '../utils/logger';

const log = createLogger('firebase/admin');

export const ADMIN_ROLE_KEYS = ['administration', 'admin_flux', 'participants'];

function mapSnapshot(snap) {
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export function subscribeAllowedUsers(eventId, onData) {
  return onSnapshot(eventSubcollection(eventId, 'allowedUsers'), (snap) => {
    const users = mapSnapshot(snap).sort((a, b) => a.id.localeCompare(b.id));
    log.debug('allowedUsers snapshot', { eventId, count: users.length });
    onData(users);
  }, (error) => {
    log.error('allowedUsers subscription failed', { eventId, error });
  });
}

export function subscribeAccessRequests(eventId, onData) {
  return onSnapshot(eventSubcollection(eventId, 'accessRequests'), (snap) => {
    const requests = mapSnapshot(snap)
      .filter((request) => request.status === 'pending')
      .sort((a, b) => {
        const aMs = a.requestedAt?.toMillis?.() ?? 0;
        const bMs = b.requestedAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
    log.debug('accessRequests snapshot', { count: requests.length });
    onData(requests);
  }, (error) => {
    log.error('accessRequests subscription failed', error);
  });
}

export function requestAccess(eventId, user) {
  const email = user?.email?.trim().toLowerCase();
  if (!email) throw new Error('missing-email');
  log.info('requestAccess', { eventId, email, uid: user?.uid });

  return setDoc(
    eventSubdoc(eventId, 'accessRequests', email),
    {
      email,
      displayName: user.displayName ?? '',
      signInProvider: user?.providerData?.[0]?.providerId ?? '',
      status: 'pending',
      reviewedAt: deleteField(),
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function saveAllowedUser(eventId, email, roles) {
  const normalizedEmail = email.trim().toLowerCase();
  const nextRoles = Object.fromEntries(
    ADMIN_ROLE_KEYS.map((role) => [role, !!roles?.[role]]),
  );

  log.info('saveAllowedUser', { eventId, email: normalizedEmail, roles: nextRoles });
  return setDoc(
    eventSubdoc(eventId, 'allowedUsers', normalizedEmail),
    {
      email: normalizedEmail,
      ...nextRoles,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function approveAccessRequest(eventId, email, roles) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('approveAccessRequest', { eventId, email: normalizedEmail, roles });
  await saveAllowedUser(eventId, normalizedEmail, roles);
  await updateDoc(eventSubdoc(eventId, 'accessRequests', normalizedEmail), {
    status: 'approved',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function rejectAccessRequest(eventId, email) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('rejectAccessRequest', { eventId, email: normalizedEmail });
  return updateDoc(eventSubdoc(eventId, 'accessRequests', normalizedEmail), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function deleteAllowedUser(eventId, email) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('deleteAllowedUser', { eventId, email: normalizedEmail });
  return deleteDoc(eventSubdoc(eventId, 'allowedUsers', normalizedEmail));
}
