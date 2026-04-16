import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createLogger } from '../utils/logger';

const ALLOWED_USERS = collection(db, 'allowedUsers');
const ACCESS_REQUESTS = collection(db, 'accessRequests');
const log = createLogger('firebase/admin');

export const ADMIN_ROLE_KEYS = ['administration', 'admin_flux', 'participants'];

function mapSnapshot(snap) {
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export function subscribeAllowedUsers(onData) {
  return onSnapshot(ALLOWED_USERS, (snap) => {
    const users = mapSnapshot(snap).sort((a, b) => a.id.localeCompare(b.id));
    log.debug('allowedUsers snapshot', { count: users.length });
    onData(users);
  }, (error) => {
    log.error('allowedUsers subscription failed', error);
  });
}

export function subscribeAccessRequests(onData) {
  return onSnapshot(ACCESS_REQUESTS, (snap) => {
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

export function requestAccess(user) {
  const email = user?.email?.trim().toLowerCase();
  if (!email) throw new Error('missing-email');
  log.info('requestAccess', { email, uid: user?.uid });

  return setDoc(
    doc(db, 'accessRequests', email),
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

export function saveAllowedUser(email, roles) {
  const normalizedEmail = email.trim().toLowerCase();
  const nextRoles = Object.fromEntries(
    ADMIN_ROLE_KEYS.map((role) => [role, !!roles?.[role]]),
  );

  log.info('saveAllowedUser', { email: normalizedEmail, roles: nextRoles });
  return setDoc(
    doc(db, 'allowedUsers', normalizedEmail),
    {
      email: normalizedEmail,
      ...nextRoles,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function approveAccessRequest(email, roles) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('approveAccessRequest', { email: normalizedEmail, roles });
  await saveAllowedUser(normalizedEmail, roles);
  await updateDoc(doc(db, 'accessRequests', normalizedEmail), {
    status: 'approved',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function rejectAccessRequest(email) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('rejectAccessRequest', { email: normalizedEmail });
  return updateDoc(doc(db, 'accessRequests', normalizedEmail), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function deleteAllowedUser(email) {
  const normalizedEmail = email.trim().toLowerCase();
  log.info('deleteAllowedUser', { email: normalizedEmail });
  return deleteDoc(doc(db, 'allowedUsers', normalizedEmail));
}
