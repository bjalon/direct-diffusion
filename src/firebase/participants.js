import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';

const COLL = () => collection(db, 'participants');

export function subscribeParticipants(onData) {
  return onSnapshot(
    query(COLL(), orderBy('order', 'asc')),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  );
}

export const addParticipant = (label, order) =>
  addDoc(COLL(), { label, order });

export const updateParticipant = (id, data) =>
  updateDoc(doc(db, 'participants', id), data);

export const deleteParticipant = (id) =>
  deleteDoc(doc(db, 'participants', id));
