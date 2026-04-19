import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';

export function eventDoc(eventId) {
  return doc(db, 'events', eventId);
}

export function eventSubcollection(eventId, collectionName) {
  return collection(db, 'events', eventId, collectionName);
}

export function eventSubdoc(eventId, collectionName, docId) {
  return doc(db, 'events', eventId, collectionName, docId);
}

export function eventConfigDoc(eventId, docId = 'streams') {
  return doc(db, 'events', eventId, 'config', docId);
}

export function eventCurrentCompetitorDoc(eventId) {
  return doc(db, 'events', eventId, 'currentCompetitor', 'current');
}

export function globalAllowedUserDoc(email) {
  return doc(db, 'allowedUsers', email.trim().toLowerCase());
}
