'use client';

import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

import { getFirebaseApp } from './app';
export { db } from './firestore';

const app = getFirebaseApp();

export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
