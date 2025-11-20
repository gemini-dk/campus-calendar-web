'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { onSnapshot, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/useAuth';

import { GOOGLE_CALENDAR_SCOPES } from '../constants';
import { getIntegrationDocRef, removeAllGoogleCalendarEvents } from '../firestore';
import { saveOAuthSession } from '../oauthStorage';
import { generateCodeVerifier, deriveCodeChallenge } from '../pkce';
import { ensureIntegrationDocument } from '../sync';
import type { GoogleCalendarIntegrationDoc, GoogleCalendarSyncState } from '../types';
import { getGoogleCalendarClientId, getGoogleCalendarRedirectUri } from '../config';
import { createClientSyncStore, DEFAULT_GOOGLE_CALENDAR_INTEGRATION_DOC } from '../stores/clientStore';
import { GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS } from '../syncPolicies';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export type GoogleCalendarIntegrationState = {
  integration: GoogleCalendarIntegrationDoc | null;
  loading: boolean;
  error: string | null;
  syncState: GoogleCalendarSyncState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  refreshCalendarList: () => Promise<boolean>;
  updateCalendarSelection: (selectedCalendarIds: string[]) => Promise<boolean>;
  calendarListLoading: boolean;
  calendarSelectionSaving: boolean;
  calendarListError: string | null;
  hasSelectedCalendars: boolean;
};

const DEFAULT_INTEGRATION_STATE: GoogleCalendarIntegrationDoc = DEFAULT_GOOGLE_CALENDAR_INTEGRATION_DOC;

const clientSyncStore = createClientSyncStore(db);

type UseGoogleCalendarIntegrationOptions = {
  enabled?: boolean;
};

export function useGoogleCalendarIntegration(
  options?: UseGoogleCalendarIntegrationOptions,
): GoogleCalendarIntegrationState {
  const { profile } = useAuth();
  const userId = profile?.uid ?? null;
  const isEnabled = options?.enabled ?? true;
  const [integration, setIntegration] = useState<GoogleCalendarIntegrationDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(isEnabled);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<GoogleCalendarSyncState>({
    inProgress: false,
    lastSyncedAt: null,
    error: null,
  });
  const [calendarListLoading, setCalendarListLoading] = useState<boolean>(false);
  const [calendarSelectionSaving, setCalendarSelectionSaving] = useState<boolean>(false);
  const [calendarListError, setCalendarListError] = useState<string | null>(null);
  const hasSelectedCalendars = useMemo(
    () => integration?.calendarList?.some((entry) => entry.selected) ?? false,
    [integration?.calendarList],
  );
  useEffect(() => {
    if (!isEnabled) {
      setIntegration(null);
      setLoading(false);
      setError(null);
      setSyncState({ inProgress: false, lastSyncedAt: null, error: null });
      setCalendarListLoading(false);
      setCalendarListError(null);
      setCalendarSelectionSaving(false);
      return;
    }

    if (!userId) {
      setIntegration(null);
      setLoading(false);
      setSyncState({ inProgress: false, lastSyncedAt: null, error: null });
      setCalendarListError(null);
      setCalendarSelectionSaving(false);
      return;
    }

    let unsubscribe = () => {};
    let cancelled = false;

    setLoading(true);
    setError(null);

    ensureIntegrationDocument(clientSyncStore, userId)
      .then(() => {
        if (cancelled) {
          return;
        }
        const ref = getIntegrationDocRef(db, userId);
        unsubscribe = onSnapshot(
          ref,
          (snapshot) => {
            if (!snapshot.exists()) {
              setIntegration(DEFAULT_INTEGRATION_STATE);
              return;
            }
            const data = snapshot.data() as Partial<GoogleCalendarIntegrationDoc>;
            setIntegration({
              ...DEFAULT_INTEGRATION_STATE,
              ...data,
              updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
            });
            setSyncState((previous) => ({
              inProgress: data.lastSyncStatus === 'syncing',
              lastSyncedAt:
                typeof data.lastSyncedAt === 'number' ? data.lastSyncedAt : previous.lastSyncedAt,
              error:
                data.lastSyncStatus === 'error'
                  ? typeof data.lastSyncError === 'string'
                    ? data.lastSyncError
                    : '同期に失敗しました。'
                  : null,
            }));
          },
          (snapshotError) => {
            console.error('Google カレンダー連携情報の購読に失敗しました。', snapshotError);
            setIntegration(DEFAULT_INTEGRATION_STATE);
            setError('Googleカレンダー連携情報の取得に失敗しました。');
          },
        );
      })
      .catch((initializeError) => {
        console.error('Google カレンダー連携情報の初期化に失敗しました。', initializeError);
        setError('Googleカレンダー連携情報の初期化に失敗しました。');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isEnabled, userId]);

  const connect = useCallback(async () => {
    if (!isEnabled) {
      return;
    }
    if (!userId) {
      setError('Googleカレンダー連携にはログインが必要です。');
      return;
    }
    try {
      await ensureIntegrationDocument(clientSyncStore, userId);
      const stateToken = generateStateToken();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await deriveCodeChallenge(codeVerifier);
      const origin = window.location.origin;
      const redirectUri = getGoogleCalendarRedirectUri(origin);
      const returnUrl = window.location.href;
      saveOAuthSession({
        state: stateToken,
        codeVerifier,
        redirectUri,
        createdAt: Date.now(),
        userId,
        returnUrl,
      });

      const authUrl = new URL(AUTH_ENDPOINT);
      authUrl.searchParams.set('client_id', getGoogleCalendarClientId());
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '));
      authUrl.searchParams.set('state', stateToken);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('include_granted_scopes', 'true');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      window.location.assign(authUrl.toString());
      return;
    } catch (connectError) {
      console.error('Google カレンダー連携に失敗しました。', connectError);
      if (connectError instanceof Error) {
        setError(connectError.message);
      } else {
        setError('Googleカレンダー連携に失敗しました。時間をおいて再度お試しください。');
      }
    }
  }, [isEnabled, userId]);

  const disconnect = useCallback(async () => {
    if (!isEnabled) {
      return;
    }
    if (!userId) {
      return;
    }
    try {
      await removeAllGoogleCalendarEvents(db, userId);
      const ref = getIntegrationDocRef(db, userId);
      await setDoc(
        ref,
        {
          ...DEFAULT_INTEGRATION_STATE,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      setError(null);
    } catch (disconnectError) {
      console.error('Google カレンダー連携の解除に失敗しました。', disconnectError);
      setError('Googleカレンダー連携の解除に失敗しました。時間をおいて再度お試しください。');
    }
  }, [isEnabled, userId]);

  const syncNow = useCallback(async () => {
    if (!isEnabled || !userId || !integration) {
      return;
    }
    if (!integration.refreshToken) {
      setSyncState((previous) => ({
        inProgress: false,
        lastSyncedAt: previous.lastSyncedAt ?? integration.lastSyncedAt ?? null,
        error: 'Googleカレンダーの再認証が必要です。',
      }));
      return;
    }
    if (!hasSelectedCalendars) {
      setSyncState((previous) => ({
        inProgress: false,
        lastSyncedAt: previous.lastSyncedAt ?? integration.lastSyncedAt ?? null,
        error: '同期するカレンダーを1つ以上選択してください。設定画面から選択を保存してください。',
      }));
      return;
    }
    if (syncState.inProgress || integration.lastSyncStatus === 'syncing') {
      return;
    }
    const now = Date.now();
    const lastSyncedAt = syncState.lastSyncedAt ?? integration.lastSyncedAt ?? null;
    if (lastSyncedAt && now - lastSyncedAt < GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS) {
      setSyncState((previous) => ({
        ...previous,
        error: '前回の同期から5分経過していません。',
      }));
      return;
    }
    setSyncState({ inProgress: true, lastSyncedAt: integration.lastSyncedAt ?? null, error: null });
    try {
      const response = await fetch('/api/google-calendar/sync', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const text = await response.text();
      let payload: { error?: string; error_description?: string } = {};
      try {
        payload = text ? (JSON.parse(text) as typeof payload) : {};
      } catch (parseError) {
        console.error('Google カレンダー同期APIレスポンスの解析に失敗しました。', parseError);
      }
      if (!response.ok) {
        const message =
          typeof payload.error_description === 'string'
            ? payload.error_description
            : typeof payload.error === 'string'
              ? payload.error
              : 'Googleカレンダーの同期に失敗しました。';
        setSyncState({ inProgress: false, lastSyncedAt: integration.lastSyncedAt ?? null, error: message });
        return;
      }
      setSyncState({ inProgress: false, lastSyncedAt: Date.now(), error: null });
    } catch (syncError) {
      console.error('Google カレンダー同期APIの呼び出しに失敗しました。', syncError);
      const message = syncError instanceof Error ? syncError.message : 'Googleカレンダーの同期に失敗しました。';
      setSyncState({ inProgress: false, lastSyncedAt: integration.lastSyncedAt ?? null, error: message });
    }
  }, [hasSelectedCalendars, integration, isEnabled, syncState.inProgress, syncState.lastSyncedAt, userId]);

  const refreshCalendarList = useCallback(async () => {
    if (!isEnabled || !userId) {
      return false;
    }
    setCalendarListLoading(true);
    setCalendarListError(null);
    try {
      const response = await fetch('/api/google-calendar/calendars', {
        method: 'GET',
        credentials: 'same-origin',
      });
      const text = await response.text();
      let payload: { error?: string; error_description?: string } = {};
      try {
        payload = text ? (JSON.parse(text) as typeof payload) : {};
      } catch (parseError) {
        console.error('Google カレンダー一覧APIレスポンスの解析に失敗しました。', parseError);
      }
      if (!response.ok) {
        const message =
          typeof payload.error_description === 'string'
            ? payload.error_description
            : typeof payload.error === 'string'
              ? payload.error
              : 'Googleカレンダー一覧の取得に失敗しました。';
        setCalendarListError(message);
        return false;
      }
      return true;
    } catch (listError) {
      console.error('Google カレンダー一覧APIの呼び出しに失敗しました。', listError);
      const message = listError instanceof Error ? listError.message : 'Googleカレンダー一覧の取得に失敗しました。';
      setCalendarListError(message);
      return false;
    } finally {
      setCalendarListLoading(false);
    }
  }, [isEnabled, userId]);

  const updateCalendarSelection = useCallback(
    async (selectedCalendarIds: string[]) => {
      if (!isEnabled || !userId) {
        return false;
      }
      setCalendarSelectionSaving(true);
      setCalendarListError(null);
      try {
        const response = await fetch('/api/google-calendar/calendars', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ selectedCalendarIds }),
        });
        const text = await response.text();
        let payload: { error?: string; error_description?: string } = {};
        try {
          payload = text ? (JSON.parse(text) as typeof payload) : {};
        } catch (parseError) {
          console.error('Google カレンダー選択APIレスポンスの解析に失敗しました。', parseError);
        }
        if (!response.ok) {
          const message =
            typeof payload.error_description === 'string'
              ? payload.error_description
              : typeof payload.error === 'string'
                ? payload.error
                : '同期対象のカレンダー更新に失敗しました。';
          setCalendarListError(message);
          return false;
        }
        return true;
      } catch (updateError) {
        console.error('Google カレンダー選択APIの呼び出しに失敗しました。', updateError);
        const message =
          updateError instanceof Error ? updateError.message : '同期対象のカレンダー更新に失敗しました。';
        setCalendarListError(message);
        return false;
      } finally {
        setCalendarSelectionSaving(false);
      }
    },
    [isEnabled, userId],
  );

  useEffect(() => {
    if (!integration) {
      return;
    }
    if (!integration.refreshToken) {
      return;
    }
    if (integration.lastSyncedAt) {
      return;
    }
    if (syncState.inProgress) {
      return;
    }
    void syncNow();
  }, [integration, syncNow, syncState.inProgress]);

  return useMemo(
    () => ({
      integration,
      loading,
      error,
      syncState,
      connect,
      disconnect,
      syncNow,
      refreshCalendarList,
      updateCalendarSelection,
      calendarListLoading,
      calendarSelectionSaving,
      calendarListError,
      hasSelectedCalendars,
    }),
    [
      integration,
      loading,
      error,
      syncState,
      connect,
      disconnect,
      syncNow,
      refreshCalendarList,
      updateCalendarSelection,
      calendarListLoading,
      calendarSelectionSaving,
      calendarListError,
      hasSelectedCalendars,
    ],
  );
}

function generateStateToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `st_${Math.random().toString(36).slice(2, 10)}`;
}
