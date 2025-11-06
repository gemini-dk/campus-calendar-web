import { firebaseConfig } from '@/lib/firebase/app';

const firebaseConfigJson = JSON.stringify(firebaseConfig);

const serviceWorkerSource = `import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getMessaging, onBackgroundMessage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-sw.js';

const firebaseConfig = ${firebaseConfigJson};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  const { notification } = payload;
  const title = notification?.title ?? '通知';
  const options = {
    body: notification?.body,
    icon: notification?.image,
    data: notification?.data,
  };

  self.registration.showNotification(title, options);
});
`;

export function GET(): Response {
  const headers = new Headers({
    'Content-Type': 'text/javascript; charset=UTF-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Service-Worker-Allowed': '/',
  });

  return new Response(serviceWorkerSource, { headers });
}
