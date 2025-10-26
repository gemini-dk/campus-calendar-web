import { NextResponse } from 'next/server';

const configKeys = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

type ConfigKey = (typeof configKeys)[number];

type FirebaseConfigResponse = Record<
  ConfigKey,
  string
>;

function getConfig(): FirebaseConfigResponse {
  const entries = configKeys.map((key) => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Firebase config ${key} is not set.`);
    }
    return [key, value] as const;
  });
  return Object.fromEntries(entries) as FirebaseConfigResponse;
}

export function GET() {
  try {
    const config = getConfig();
    return NextResponse.json(config, {
      headers: {
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to build Firebase public config.', error);
    return NextResponse.json(
      { message: 'Failed to load Firebase public config.' },
      { status: 500 },
    );
  }
}
