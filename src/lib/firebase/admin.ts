import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

function initializeAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  // 既存のアプリがある場合はそれを使用
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  // 環境変数から設定を取得
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? '';
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ?? '';

  if (!projectId) {
    throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID または FIREBASE_PROJECT_ID が設定されていません。');
  }

  // サービスアカウントキーが設定されている場合
  if (privateKey && clientEmail) {
    adminApp = initializeApp({
      credential: cert({
        projectId,
        privateKey,
        clientEmail,
      }),
      projectId,
    });
  } else {
    // デフォルト認証（Google Cloud環境など）
    adminApp = initializeApp({
      projectId,
    });
  }

  return adminApp;
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    const app = initializeAdminApp();
    adminDb = getFirestore(app);
  }
  return adminDb;
}

export function getAdminApp(): App {
  return initializeAdminApp();
}
