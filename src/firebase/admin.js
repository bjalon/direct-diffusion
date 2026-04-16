import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

const ALLOWED_USERS = collection(db, 'allowedUsers');
const ACCESS_REQUESTS = collection(db, 'accessRequests');

export const ADMIN_ROLE_KEYS = ['administration', 'admin_flux', 'participants', 'results'];

function mapSnapshot(snap) {
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export function subscribeAllowedUsers(onData) {
  return onSnapshot(ALLOWED_USERS, (snap) => {
    const users = mapSnapshot(snap).sort((a, b) => a.id.localeCompare(b.id));
    onData(users);
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
    onData(requests);
  });
}

export function requestAccess(user) {
  const email = user?.email?.trim().toLowerCase();
  if (!email) throw new Error('missing-email');

  return setDoc(
    doc(db, 'accessRequests', email),
    {
      email,
      displayName: user.displayName ?? '',
      signInProvider: user?.providerData?.[0]?.providerId ?? '',
      status: 'pending',
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
  await saveAllowedUser(normalizedEmail, roles);
  await updateDoc(doc(db, 'accessRequests', normalizedEmail), {
    status: 'approved',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function rejectAccessRequest(email) {
  const normalizedEmail = email.trim().toLowerCase();
  return updateDoc(doc(db, 'accessRequests', normalizedEmail), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function deleteAllowedUser(email) {
  return deleteDoc(doc(db, 'allowedUsers', email.trim().toLowerCase()));
}
