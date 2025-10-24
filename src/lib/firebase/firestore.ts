import { getFirestore, type Firestore } from 'firebase/firestore';

import { getFirebaseApp } from './app';

let cachedDb: Firestore | null = null;

export function getFirestoreDb(): Firestore {
  if (cachedDb) {
    return cachedDb;
  }
  cachedDb = getFirestore(getFirebaseApp());
  return cachedDb;
}

export const db: Firestore = getFirestoreDb();
