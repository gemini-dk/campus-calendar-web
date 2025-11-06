import type { MessagePayload, Messaging, Unsubscribe } from 'firebase/messaging';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';

import { getFirebaseApp, firebaseVapidKey } from './app';

let messagingPromise: Promise<Messaging | null> | null = null;
let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!registrationPromise) {
    registrationPromise = (async () => {
      const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (existing) {
        return existing;
      }
      try {
        return await navigator.serviceWorker.register('/firebase-messaging-sw.js', { type: 'module' });
      } catch (error) {
        console.error('Firebase Messaging の Service Worker 登録に失敗しました。', error);
        return null;
      }
    })();
  }

  return registrationPromise;
}

export async function initializeMessaging(): Promise<Messaging | null> {
  if (messagingPromise) {
    return messagingPromise;
  }

  messagingPromise = (async () => {
    if (typeof window === 'undefined') {
      return null;
    }

    const supported = await isSupported().catch((error) => {
      console.error('Firebase Messaging のサポート判定に失敗しました。', error);
      return false;
    });

    if (!supported) {
      console.info('このブラウザは Firebase Cloud Messaging をサポートしていません。');
      return null;
    }

    const registration = await ensureServiceWorkerRegistration();
    if (!registration) {
      return null;
    }

    return getMessaging(getFirebaseApp());
  })();

  return messagingPromise;
}

export async function getMessagingToken(messaging: Messaging): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const registration = await ensureServiceWorkerRegistration();
  if (!registration) {
    return null;
  }

  if (!firebaseVapidKey) {
    console.error('Firebase の VAPID キーが設定されていません。');
    return null;
  }

  try {
    const token = await getToken(messaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration: registration,
    });
    return token ?? null;
  } catch (error) {
    console.error('Firebase Messaging のトークン取得に失敗しました。', error);
    return null;
  }
}

export function onForegroundMessage(
  messaging: Messaging,
  listener: (payload: MessagePayload) => void,
): Unsubscribe {
  return onMessage(messaging, listener);
}
