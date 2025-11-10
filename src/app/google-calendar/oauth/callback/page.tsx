'use client';

import { useEffect, useState } from 'react';
import { setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/client';
import { GOOGLE_CALENDAR_SCOPES } from '@/lib/google-calendar/constants';
import { getIntegrationDocRef } from '@/lib/google-calendar/firestore';
import { clearOAuthSession, loadOAuthSession, type OAuthSessionRecord } from '@/lib/google-calendar/oauthStorage';

export default function GoogleCalendarOAuthCallback() {
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState<string>('Googleカレンダーと連携処理を行っています...');
  const [returnUrl, setReturnUrl] = useState<string>('/');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (!state) {
      setStatus('error');
      setMessage('state パラメータが取得できませんでした。');
      return;
    }

    const session = loadOAuthSession(state);
    if (session?.returnUrl) {
      setReturnUrl(session.returnUrl);
    }

    if (!session) {
      setStatus('error');
      setMessage('OAuthセッション情報が見つかりませんでした。連携を最初からやり直してください。');
      return;
    }

    let redirectTimer: number | null = null;

    const scheduleReturn = (delay = 2000) => {
      if (typeof window === 'undefined') {
        return;
      }
      redirectTimer = window.setTimeout(() => {
        window.location.assign(session.returnUrl || '/');
      }, delay);
    };

    if (error) {
      clearOAuthSession(session.state);
      setStatus('error');
      setMessage(errorDescription ?? 'Googleカレンダー連携がキャンセルされました。');
      scheduleReturn();
      return () => {
        if (redirectTimer !== null) {
          window.clearTimeout(redirectTimer);
        }
      };
    }

    if (!code) {
      clearOAuthSession(session.state);
      setStatus('error');
      setMessage('Googleカレンダーから認可コードを取得できませんでした。');
      scheduleReturn();
      return () => {
        if (redirectTimer !== null) {
          window.clearTimeout(redirectTimer);
        }
      };
    }

    let canceled = false;

    void (async () => {
      try {
        await exchangeAuthorizationCode({
          session,
          code,
        });
        if (canceled) {
          return;
        }
        setStatus('success');
        setMessage('Googleカレンダー連携が完了しました。元の画面に戻ります。');
        scheduleReturn();
      } catch (exchangeError) {
        console.error('Google カレンダー連携の完了処理に失敗しました。', exchangeError);
        if (canceled) {
          return;
        }
        setStatus('error');
        if (exchangeError instanceof Error) {
          setMessage(exchangeError.message);
        } else {
          setMessage('Googleカレンダー連携に失敗しました。時間をおいて再度お試しください。');
        }
        scheduleReturn(4000);
      } finally {
        clearOAuthSession(session.state);
      }
    })();

    return () => {
      canceled = true;
      if (redirectTimer !== null) {
        window.clearTimeout(redirectTimer);
      }
    };
  }, []);

  const statusClass = status === 'success' ? 'text-green-600' : status === 'error' ? 'text-red-600' : 'text-neutral-700';

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="text-lg font-semibold text-neutral-900">Googleカレンダー連携</h1>
        <p className={`mt-4 text-sm leading-relaxed ${statusClass}`}>{message}</p>
        <button
          type="button"
          className="mt-6 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          onClick={() => {
            window.location.assign(returnUrl);
          }}
        >
          元の画面に戻る
        </button>
      </div>
    </div>
  );
}

type ExchangeParams = {
  session: OAuthSessionRecord;
  code: string;
};

async function exchangeAuthorizationCode({ session, code }: ExchangeParams): Promise<void> {
  const response = await fetch('/api/google-calendar/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUri,
    }),
  });

  const responseText = await response.text();
  let tokenPayload: {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  try {
    tokenPayload = JSON.parse(responseText) as typeof tokenPayload;
  } catch (parseError) {
    console.error('Google カレンダーのトークンレスポンスの解析に失敗しました。', parseError);
    throw new Error('Googleカレンダーのトークン取得に失敗しました。');
  }

  if (!response.ok) {
    const message =
      typeof tokenPayload.error_description === 'string'
        ? tokenPayload.error_description
        : typeof tokenPayload.error === 'string'
          ? tokenPayload.error
          : 'Googleカレンダーのトークン取得に失敗しました。';
    throw new Error(`Googleカレンダーのトークン取得に失敗しました: ${message}`);
  }

  if (!tokenPayload.access_token) {
    throw new Error('Googleカレンダーのアクセストークンが取得できませんでした。');
  }

  if (!tokenPayload.refresh_token) {
    throw new Error(
      'Googleカレンダーのリフレッシュトークンが取得できませんでした。連携を再度お試しください。',
    );
  }

  const expiresAt = Date.now() + (tokenPayload.expires_in ?? 3600) * 1000;
  const ref = getIntegrationDocRef(db, session.userId);
  await setDoc(
    ref,
    {
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      tokenType: tokenPayload.token_type ?? 'Bearer',
      scope: tokenPayload.scope ?? GOOGLE_CALENDAR_SCOPES.join(' '),
      expiresAt,
      syncTokens: null,
      lastSyncedAt: null,
      calendarList: null,
      lastSyncStatus: 'idle',
      lastSyncError: null,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}
