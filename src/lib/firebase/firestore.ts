import { initializeFirestore, type Firestore, type FirestoreSettings } from 'firebase/firestore';

import { getFirebaseApp } from './app';

let cachedDb: Firestore | null = null;

const FIRESTORE_SETTINGS: FirestoreSettings = {
  // Safari（特に iOS）で WebChannel 接続が確立できず読み込みが進まないことがあるため、
  // ロングポーリングを強制して読み込み待ちのままになる問題を避ける。
  experimentalForceLongPolling: true,
};

export function getFirestoreDb(): Firestore {
  if (cachedDb) {
    return cachedDb;
  }
  cachedDb = initializeFirestore(getFirebaseApp(), FIRESTORE_SETTINGS);
  return cachedDb;
}

export const db: Firestore = getFirestoreDb();
