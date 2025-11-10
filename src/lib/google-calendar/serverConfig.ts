const SERVER_GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID ?? '';

const GOOGLE_CALENDAR_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '';

export function getServerGoogleCalendarClientId(): string {
  if (!SERVER_GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CALENDAR_CLIENT_ID または NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID が設定されていません。');
  }
  return SERVER_GOOGLE_CLIENT_ID;
}

export function getGoogleCalendarClientSecret(): string {
  if (!GOOGLE_CALENDAR_CLIENT_SECRET) {
    throw new Error('GOOGLE_CALENDAR_CLIENT_SECRET が設定されていません。');
  }
  return GOOGLE_CALENDAR_CLIENT_SECRET;
}
