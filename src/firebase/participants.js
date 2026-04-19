import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { eventSubcollection, eventSubdoc } from './eventRefs';
import { createLogger } from '../utils/logger';

const log = createLogger('firebase/participants');

const COLL = (eventId) => eventSubcollection(eventId, 'participants');

export function subscribeParticipants(eventId, onData) {
  return onSnapshot(
    query(COLL(eventId), orderBy('order', 'asc')),
    (snap) => {
      const participants = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          active: data.active !== false,
          trigram: data.trigram ?? '',
        };
      });
      log.debug('participants snapshot', { eventId, count: participants.length });
      onData(participants);
    },
    (error) => {
      log.error('participants subscription failed', { eventId, error });
    },
  );
}

export const addParticipant = (eventId, labelOrData, order) => {
  const payload = typeof labelOrData === 'string'
    ? { label: labelOrData, order, active: true }
    : {
      ...labelOrData,
      active: labelOrData?.active !== false,
    };

  log.info('addParticipant', { eventId, payload });
  return addDoc(COLL(eventId), payload);
};

export const updateParticipant = (eventId, id, data) =>
  (log.info('updateParticipant', { eventId, id, data }), updateDoc(eventSubdoc(eventId, 'participants', id), data));

export const deleteParticipant = (eventId, id) =>
  (log.info('deleteParticipant', { eventId, id }), deleteDoc(eventSubdoc(eventId, 'participants', id)));

export async function reorderParticipants(eventId, participantIds) {
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return;
  }

  log.info('reorderParticipants', { eventId, count: participantIds.length });
  const batch = writeBatch(db);

  participantIds.forEach((participantId, index) => {
    batch.update(eventSubdoc(eventId, 'participants', participantId), { order: index + 1 });
  });

  await batch.commit();
}
