/* eslint-disable no-undef */
const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js',
];

let scriptsLoaded = false;
let messagingInitPromise = null;

async function initializeFirebaseMessaging() {
  if (self.firebaseMessagingInstance) {
    return self.firebaseMessagingInstance;
  }
  if (messagingInitPromise) {
    return messagingInitPromise;
  }

  messagingInitPromise = (async () => {
    if (!scriptsLoaded) {
      importScripts(FIREBASE_SCRIPTS[0], FIREBASE_SCRIPTS[1]);
      scriptsLoaded = true;
    }

    const response = await fetch('/api/firebase-config', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to load Firebase config for messaging.');
    }
    const config = await response.json();

    if (!self.firebaseAppInstance) {
      self.firebaseAppInstance = firebase.initializeApp(config);
    }

    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const notification = payload.notification ?? {};
      const title = notification.title ?? 'キャンパスカレンダー';
      const options = {
        body: notification.body ?? '',
        icon: notification.icon,
        data: payload.data ?? {},
        tag: notification.tag,
        renotify: notification.renotify,
      };
      self.registration.showNotification(title, options).catch((error) => {
        console.error('Failed to display notification.', error);
      });
    });

    self.firebaseMessagingInstance = messaging;
    return messaging;
  })().catch((error) => {
    console.error('Failed to initialize Firebase Messaging in service worker.', error);
    messagingInitPromise = null;
    throw error;
  });

  return messagingInitPromise;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    initializeFirebaseMessaging().catch((error) => {
      console.error('Messaging initialization during install failed.', error);
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'INIT_MESSAGING') {
    return;
  }
  event.waitUntil(
    initializeFirebaseMessaging().catch((error) => {
      console.error('Messaging initialization from client message failed.', error);
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const targetUrl = event.notification?.data?.url;
  event.notification?.close();
  if (!targetUrl) {
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
