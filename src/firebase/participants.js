import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createLogger } from '../utils/logger';

const COLL = () => collection(db, 'participants');
const log = createLogger('firebase/participants');

export function subscribeParticipants(onData) {
  return onSnapshot(
    query(COLL(), orderBy('order', 'asc')),
    (snap) => {
      const participants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      log.debug('participants snapshot', { count: participants.length });
      onData(participants);
    },
    (error) => {
      log.error('participants subscription failed', error);
    },
  );
}

export const addParticipant = (label, order) =>
  (log.info('addParticipant', { label, order }), addDoc(COLL(), { label, order }));

export const updateParticipant = (id, data) =>
  (log.info('updateParticipant', { id, data }), updateDoc(doc(db, 'participants', id), data));

export const deleteParticipant = (id) =>
  (log.info('deleteParticipant', { id }), deleteDoc(doc(db, 'participants', id)));
