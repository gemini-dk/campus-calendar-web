import type { MessagePayload, Messaging, Unsubscribe } from 'firebase/messaging';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';

import { getFirebaseApp, firebaseVapidKey } from './app';

type MessagingSupportErrorCode =
  | 'insecure-context'
  | 'service-worker-unsupported'
  | 'push-unsupported'
  | 'messaging-unsupported'
  | 'registration-failed';

export class MessagingSupportError extends Error {
  constructor(public readonly code: MessagingSupportErrorCode, message: string) {
    super(message);
    this.name = 'MessagingSupportError';
  }
}

let messagingPromise: Promise<Messaging> | null = null;
let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (typeof window === 'undefined') {
    throw new MessagingSupportError(
      'service-worker-unsupported',
      'Service Worker はブラウザ環境でのみ利用できます。',
    );
  }

  if (!window.isSecureContext) {
    throw new MessagingSupportError(
      'insecure-context',
      'HTTPS もしくは localhost からアクセスする必要があります。',
    );
  }

  if (!('serviceWorker' in navigator)) {
    throw new MessagingSupportError(
      'service-worker-unsupported',
      'このブラウザでは Service Worker が無効化されているため、通知を利用できません。',
    );
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
        throw new MessagingSupportError(
          'registration-failed',
          'Firebase Messaging の Service Worker 登録に失敗しました。ブラウザの設定を確認してください。',
        );
      }
    })();
  }

  try {
    return await registrationPromise;
  } catch (error) {
    registrationPromise = null;
    throw error;
  }
}

export async function initializeMessaging(): Promise<Messaging> {
  if (messagingPromise) {
    return messagingPromise;
  }

  messagingPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new MessagingSupportError(
        'service-worker-unsupported',
        'ブラウザ環境でのみ Firebase Messaging を初期化できます。',
      );
    }

    if (!window.isSecureContext) {
      throw new MessagingSupportError(
        'insecure-context',
        '通知を利用するには HTTPS でアクセスしてください。',
      );
    }

    if (!('Notification' in window)) {
      throw new MessagingSupportError(
        'push-unsupported',
        'このブラウザは通知 API をサポートしていません。',
      );
    }

    if (!('PushManager' in window)) {
      throw new MessagingSupportError(
        'push-unsupported',
        'このブラウザはプッシュ通知に対応していません。',
      );
    }

    if (!('serviceWorker' in navigator)) {
      throw new MessagingSupportError(
        'service-worker-unsupported',
        'このブラウザでは Service Worker が無効化されているため、通知を利用できません。',
      );
    }

    const supported = await isSupported().catch((error) => {
      console.error('Firebase Messaging のサポート判定に失敗しました。', error);
      return false;
    });

    if (!supported) {
      throw new MessagingSupportError(
        'messaging-unsupported',
        'このブラウザは Firebase Cloud Messaging に対応していません。',
      );
    }

    await ensureServiceWorkerRegistration();

    return getMessaging(getFirebaseApp());
  })();

  try {
    return await messagingPromise;
  } catch (error) {
    messagingPromise = null;
    throw error;
  }
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
