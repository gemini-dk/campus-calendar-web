'use client';

import type { Messaging } from 'firebase/messaging';
import { firebasePublicConfig, getFirebaseApp } from '@/lib/firebase/app';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

let messagingInstance: Messaging | null = null;
let messagingInitPromise: Promise<Messaging | null> | null = null;
let serviceWorkerPromise: Promise<ServiceWorkerRegistration> | null = null;

async function loadMessaging(): Promise<Messaging | null> {
  if (messagingInstance) {
    return messagingInstance;
  }
  if (messagingInitPromise) {
    return messagingInitPromise;
  }

  messagingInitPromise = (async () => {
    if (typeof window === 'undefined') {
      return null;
    }
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      return null;
    }
    messagingInstance = getMessaging(getFirebaseApp());
    return messagingInstance;
  })().catch((error) => {
    console.error('Failed to initialize Firebase Messaging.', error);
    return null;
  });

  const instance = await messagingInitPromise;
  messagingInitPromise = null;
  return instance;
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (serviceWorkerPromise) {
    return serviceWorkerPromise;
  }

  serviceWorkerPromise = (async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      throw new Error('Service workers are not supported in this environment.');
    }

    const existingRegistration = await navigator.serviceWorker.getRegistration('/');
    if (!existingRegistration) {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    }

    const readyRegistration = await navigator.serviceWorker.ready;
    readyRegistration.active?.postMessage({
      type: 'INIT_MESSAGING',
      config: firebasePublicConfig,
    });
    return readyRegistration;
  })().catch((error) => {
    console.error('Failed to register Firebase Messaging service worker.', error);
    throw error;
  });

  return serviceWorkerPromise;
}

export async function isMessagingSupported(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }
  const messaging = await loadMessaging();
  return Boolean(messaging);
}

export async function getFcmToken(forceRefresh = false): Promise<string | null> {
  if (!VAPID_KEY) {
    throw new Error('NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured.');
  }

  const messaging = await loadMessaging();
  if (!messaging) {
    return null;
  }

  const registration = await ensureServiceWorkerRegistration();

  const { deleteToken, getToken } = await import('firebase/messaging');

  if (forceRefresh) {
    try {
      await deleteToken(messaging);
    } catch (error) {
      console.warn('Failed to delete existing FCM token before refresh.', error);
    }
  }

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  }).catch((error) => {
    console.error('Failed to get FCM token.', error);
    throw error;
  });

  if (!token || typeof token !== 'string') {
    return null;
  }
  return token;
}
