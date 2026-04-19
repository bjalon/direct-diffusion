import { updateCurrentUser } from 'firebase/auth';
import { createLogger } from './logger';
import { UserImpl } from '../../node_modules/firebase/node_modules/@firebase/auth/internal';

const STORAGE_KEY = 'direct-diffusion-anonymous-accounts';
const MAX_ACCOUNTS = 12;
const log = createLogger('anonymousAccounts');

function canUseStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function buildScope(auth, eventId = 'global') {
  return JSON.stringify({
    appName: auth?.name || '',
    apiKey: auth?.config?.apiKey || '',
    projectId: auth?.app?.options?.projectId || '',
    eventId: eventId || 'global',
  });
}

function normalizeEmail(value) {
  return (value || '').trim().toLowerCase();
}

function normalizeRoles(roles = {}) {
  return {
    tv: !!roles.tv,
    results_start: !!roles.results_start,
    results_finish: !!roles.results_finish,
  };
}

function readStore() {
  if (!canUseStorage()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    log.warn('failed to read anonymous accounts', { error });
    return {};
  }
}

function writeStore(store) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.uid || !entry.authUser) {
    return null;
  }

  return {
    uid: entry.uid,
    email: normalizeEmail(entry.email),
    roles: normalizeRoles(entry.roles),
    requestStatus: typeof entry.requestStatus === 'string' ? entry.requestStatus : '',
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
    lastUsedAt: typeof entry.lastUsedAt === 'string' ? entry.lastUsedAt : '',
    authUser: entry.authUser,
  };
}

function readEntries(auth, eventId) {
  const scope = buildScope(auth, eventId);
  const store = readStore();
  const rawEntries = Array.isArray(store[scope]) ? store[scope] : [];

  return rawEntries
    .map(normalizeEntry)
    .filter(Boolean)
    .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''));
}

function writeEntries(auth, eventId, entries) {
  const scope = buildScope(auth, eventId);
  const store = readStore();
  store[scope] = entries.slice(0, MAX_ACCOUNTS);
  writeStore(store);
}

export function listAnonymousAccounts(auth, eventId) {
  return readEntries(auth, eventId);
}

export function rememberAnonymousAccount(auth, user, eventId, metadata = {}) {
  if (!user?.isAnonymous) return;

  const now = new Date().toISOString();
  const entries = readEntries(auth, eventId);
  const existing = entries.find((entry) => entry.uid === user.uid);
  const nextEntry = normalizeEntry({
    uid: user.uid,
    email: metadata.email ?? existing?.email ?? '',
    roles: metadata.roles ?? existing?.roles ?? {},
    requestStatus: metadata.requestStatus ?? existing?.requestStatus ?? '',
    createdAt: existing?.createdAt || now,
    lastUsedAt: now,
    authUser: user.toJSON(),
  });

  const nextEntries = [
    nextEntry,
    ...entries.filter((entry) => entry.uid !== user.uid),
  ].filter(Boolean);

  writeEntries(auth, eventId, nextEntries);
}

export function forgetAnonymousAccount(auth, eventId, uid) {
  if (!uid) return;
  writeEntries(
    auth,
    eventId,
    readEntries(auth, eventId).filter((entry) => entry.uid !== uid),
  );
}

export async function restoreAnonymousAccount(auth, eventId, uid) {
  const entry = readEntries(auth, eventId).find((candidate) => candidate.uid === uid);
  if (!entry) {
    throw new Error('anonymous-account-not-found');
  }

  try {
    const user = UserImpl._fromJSON(auth, entry.authUser);
    await updateCurrentUser(auth, user);
    rememberAnonymousAccount(auth, user, eventId, {
      email: entry.email,
      roles: entry.roles,
      requestStatus: entry.requestStatus,
    });
    return user;
  } catch (error) {
    log.error('failed to restore anonymous account', { uid, error });
    forgetAnonymousAccount(auth, eventId, uid);
    throw error;
  }
}
