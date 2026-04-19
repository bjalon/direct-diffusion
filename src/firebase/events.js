import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { eventDoc, globalAllowedUserDoc } from './eventRefs';
import { isEventPromoted } from '../utils/eventPresentation';
import { createLogger } from '../utils/logger';

const EVENTS = collection(db, 'events');
const log = createLogger('firebase/events');

const EVENT_TYPE_LABELS = {
  soapbox: 'Caisse à savon',
  football: 'Football',
  handball: 'Handball',
};

export const EVENT_TYPE_OPTIONS = Object.keys(EVENT_TYPE_LABELS).map((value) => ({
  value,
  label: EVENT_TYPE_LABELS[value],
}));

function mapEventSnapshot(snap) {
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    slug: data.slug || snap.id,
    title: data.title || snap.id,
    type: data.type || 'soapbox',
    published: data.published !== false,
    createdAt: data.createdAt ?? null,
    promotionStartsAt: data.promotionStartsAt ?? null,
    promotionEndsAt: data.promotionEndsAt ?? null,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    siteUrl: data.siteUrl ?? '',
    location: {
      label: data.location?.label ?? '',
      address: data.location?.address ?? '',
      latitude: data.location?.latitude ?? null,
      longitude: data.location?.longitude ?? null,
    },
    iconDataUrl: data.iconDataUrl ?? '',
    ...data,
  };
}

function sortEvents(a, b) {
  const aPromo = a.promotionStartsAt?.toMillis?.() ?? 0;
  const bPromo = b.promotionStartsAt?.toMillis?.() ?? 0;
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  if (aPromo !== bPromo) return bPromo - aPromo;
  return a.title.localeCompare(b.title);
}

export function eventTypeLabel(type) {
  return EVENT_TYPE_LABELS[type] || type || 'Autre';
}

export function slugifyEventTitle(title) {
  const normalized = (title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  return normalized || `event-${Date.now().toString(36)}`;
}

export function subscribeEvents(onData, { promotedOnly = false, includeUnpublished = false } = {}) {
  const eventsQuery = includeUnpublished
    ? query(EVENTS, orderBy('createdAt', 'desc'))
    : query(EVENTS, where('published', '==', true));

  return onSnapshot(eventsQuery, (snap) => {
    const now = Date.now();
    const events = snap.docs
      .map(mapEventSnapshot)
      .filter(Boolean)
      .filter((event) => includeUnpublished || event.published !== false)
      .filter((event) => {
        if (!promotedOnly) return true;
        return isEventPromoted(event, now);
      })
      .sort(sortEvents);
    log.debug('events snapshot', { count: events.length, promotedOnly, includeUnpublished });
    onData(events);
  }, (error) => {
    log.error('events subscription failed', { promotedOnly, includeUnpublished, error });
  });
}

export function subscribeEvent(eventId, onData) {
  return onSnapshot(eventDoc(eventId), (snap) => {
    const data = mapEventSnapshot(snap);
    log.debug('event snapshot', { eventId, exists: !!data });
    onData(data);
  }, (error) => {
    log.error('event subscription failed', { eventId, error });
    onData(null);
  });
}

export async function getGlobalRoles(email) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;
  log.info('getGlobalRoles', { email: normalizedEmail });
  const snap = await getDoc(globalAllowedUserDoc(normalizedEmail));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createEvent({
  slug,
  title,
  type = 'soapbox',
  promotionStartsAt,
  promotionEndsAt = null,
  startsAt,
  endsAt = null,
  published = true,
  siteUrl = '',
  location = {},
  iconDataUrl = '',
}) {
  const nextSlug = slugifyEventTitle(slug || title);
  log.info('createEvent', { eventId: nextSlug, title, type });
  await setDoc(doc(EVENTS, nextSlug), {
    slug: nextSlug,
    title: title.trim(),
    type,
    published,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    promotionStartsAt,
    promotionEndsAt: promotionEndsAt || null,
    startsAt,
    endsAt: endsAt || null,
    siteUrl,
    location: {
      label: location.label || '',
      address: location.address || '',
      latitude: Number.isFinite(location.latitude) ? location.latitude : null,
      longitude: Number.isFinite(location.longitude) ? location.longitude : null,
    },
    iconDataUrl: iconDataUrl || '',
  }, { merge: false });
  return nextSlug;
}

export function updateEvent(eventId, data) {
  log.info('updateEvent', { eventId, keys: Object.keys(data || {}) });
  return updateDoc(eventDoc(eventId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
