import { GOOGLE_CALENDAR_OAUTH_STORAGE_PREFIX } from './constants';

export type OAuthSessionRecord = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  userId: string;
  returnUrl: string;
};

export function saveOAuthSession(record: OAuthSessionRecord): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const key = getStorageKey(record.state);
    window.sessionStorage.setItem(key, JSON.stringify(record));
  } catch (error) {
    console.warn('Google カレンダー OAuth セッションの保存に失敗しました。', error);
  }
}

export function loadOAuthSession(state: string): OAuthSessionRecord | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const key = getStorageKey(state);
    const rawValue = window.sessionStorage.getItem(key);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue) as Partial<OAuthSessionRecord>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (typeof parsed.state !== 'string' || typeof parsed.codeVerifier !== 'string') {
      return null;
    }
    if (typeof parsed.redirectUri !== 'string' || typeof parsed.createdAt !== 'number') {
      return null;
    }
    if (typeof parsed.userId !== 'string' || typeof parsed.returnUrl !== 'string') {
      return null;
    }
    return parsed as OAuthSessionRecord;
  } catch (error) {
    console.warn('Google カレンダー OAuth セッションの読み込みに失敗しました。', error);
    return null;
  }
}

export function clearOAuthSession(state: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const key = getStorageKey(state);
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn('Google カレンダー OAuth セッションの削除に失敗しました。', error);
  }
}

function getStorageKey(state: string): string {
  return `${GOOGLE_CALENDAR_OAUTH_STORAGE_PREFIX}${state}`;
}
