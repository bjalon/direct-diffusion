import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createLogger } from '../utils/logger';

const COLL = () => collection(db, 'participants');
const log = createLogger('firebase/participants');

export function subscribeParticipants(onData) {
  return onSnapshot(
    query(COLL(), orderBy('order', 'asc')),
    (snap) => {
      const participants = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          active: data.active !== false,
        };
      });
      log.debug('participants snapshot', { count: participants.length });
      onData(participants);
    },
    (error) => {
      log.error('participants subscription failed', error);
    },
  );
}

export const addParticipant = (label, order) =>
  (log.info('addParticipant', { label, order }), addDoc(COLL(), { label, order, active: true }));

export const updateParticipant = (id, data) =>
  (log.info('updateParticipant', { id, data }), updateDoc(doc(db, 'participants', id), data));

export const deleteParticipant = (id) =>
  (log.info('deleteParticipant', { id }), deleteDoc(doc(db, 'participants', id)));

export async function reorderParticipants(participantIds) {
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return;
  }

  log.info('reorderParticipants', { count: participantIds.length });
  const batch = writeBatch(db);

  participantIds.forEach((participantId, index) => {
    batch.update(doc(db, 'participants', participantId), { order: index + 1 });
  });

  await batch.commit();
}
