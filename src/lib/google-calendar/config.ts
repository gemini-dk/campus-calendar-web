const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID ?? '';

export function getGoogleCalendarClientId(): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID が設定されていません。');
  }
  return GOOGLE_CLIENT_ID;
}

export function getGoogleCalendarRedirectUri(origin: string): string {
  const trimmedOrigin = origin.replace(/\/$/, '');
  return `${trimmedOrigin}/google-calendar/oauth/callback`;
}
