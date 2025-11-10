'use client';

import { useEffect, useMemo, useState } from 'react';

const MESSAGE_EVENT_TYPE = 'google-calendar-oauth';

export default function GoogleCalendarOAuthCallback() {
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState<string>('Googleカレンダーと連携処理を行っています...');

  const payload = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    return {
      code: params.get('code'),
      state: params.get('state'),
      error: params.get('error'),
      errorDescription: params.get('error_description'),
    } as const;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !payload) {
      return;
    }

    const hasOpener = Boolean(window.opener);
    if (!hasOpener) {
      setStatus('error');
      setMessage('このページは直接開けません。Googleカレンダー連携画面からアクセスしてください。');
      return;
    }

    window.opener.postMessage(
      {
        type: MESSAGE_EVENT_TYPE,
        code: payload.code,
        state: payload.state,
        error: payload.error,
        error_description: payload.errorDescription,
      },
      window.location.origin,
    );

    if (payload.error) {
      setStatus('error');
      setMessage('Googleカレンダー連携がキャンセルされました。ブラウザの画面に戻ってください。');
    } else {
      setStatus('success');
      setMessage('Googleカレンダー連携が完了しました。ブラウザの画面に戻ります。');
    }

    const timer = window.setTimeout(() => {
      window.close();
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [payload]);

  const statusClass = status === 'success' ? 'text-green-600' : status === 'error' ? 'text-red-600' : 'text-neutral-700';

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="text-lg font-semibold text-neutral-900">Googleカレンダー連携</h1>
        <p className={`mt-4 text-sm leading-relaxed ${statusClass}`}>{message}</p>
        <p className="mt-6 text-xs text-neutral-500">このウィンドウは自動的に閉じられます。</p>
      </div>
    </div>
  );
}
