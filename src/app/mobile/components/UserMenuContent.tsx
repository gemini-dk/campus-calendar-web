'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';

function mergeClassName(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

export type UserMenuContentProps = {
  className?: string;
};

export default function UserMenuContent({ className }: UserMenuContentProps) {
  const {
    profile,
    isAuthenticated,
    initializing,
    isProcessing,
    error,
    successMessage,
    signInWithGoogle,
    signOut,
  } = useAuth();
  const { settings, saveCalendarSettings, resetCalendarSettings, initialized } = useUserSettings();
  const [fiscalYear, setFiscalYear] = useState(settings.calendar.fiscalYear);
  const [calendarId, setCalendarId] = useState(settings.calendar.calendarId);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setFiscalYear(settings.calendar.fiscalYear);
    setCalendarId(settings.calendar.calendarId);
  }, [settings.calendar.calendarId, settings.calendar.fiscalYear]);

  useEffect(() => {
    setStatusMessage(null);
  }, [fiscalYear, calendarId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveCalendarSettings({ fiscalYear, calendarId });
    setStatusMessage('保存しました。');
  };

  const handleReset = () => {
    resetCalendarSettings();
    setStatusMessage('初期設定に戻しました。');
  };

  const feedbackMessage = useMemo(() => {
    if (error) {
      return { text: error, className: 'text-red-600' } as const;
    }
    if (successMessage) {
      return { text: successMessage, className: 'text-green-600' } as const;
    }
    return null;
  }, [error, successMessage]);

  const rootClassName = mergeClassName(
    'flex h-full w-full flex-col gap-6 bg-neutral-50 p-4 text-neutral-800',
    className,
  );

  return (
    <div className={rootClassName}>
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        {initializing ? (
          <p className="text-sm text-neutral-600">読み込み中...</p>
        ) : isAuthenticated ? (
          <div className="flex flex-col items-start gap-4">
            <div>
              <p className="text-base font-medium text-neutral-900">
                {profile?.displayName ?? 'ユーザ'} さんでログイン中
              </p>
              <p className="mt-1 text-sm text-neutral-600">アカウント設定や学事情報の閲覧が可能です。</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={isProcessing}
              className="w-full rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {isProcessing ? '処理中...' : 'ログアウト'}
            </button>
            {feedbackMessage ? (
              <p className={`text-xs ${feedbackMessage.className}`}>{feedbackMessage.text}</p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            <div>
              <p className="text-base font-medium text-neutral-900">ログインして機能を利用しましょう。</p>
              <p className="mt-1 text-sm text-neutral-600">Googleアカウントでサインインできます。</p>
            </div>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={isProcessing}
              className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isProcessing ? '処理中...' : 'Googleでログイン'}
            </button>
            {feedbackMessage ? (
              <p className={`text-xs ${feedbackMessage.className}`}>{feedbackMessage.text}</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">学事カレンダー設定</h2>
          <p className="mt-1 text-sm text-neutral-600">
            利用する年度と学事カレンダーIDを保存すると、ホームやカレンダーで表示する情報が切り替わります。
          </p>
        </div>
        {initialized ? (
          <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">年度 (YYYY)</span>
              <input
                type="text"
                value={fiscalYear}
                onChange={(event) => setFiscalYear(event.target.value)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="2025"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">学事カレンダーID</span>
              <input
                type="text"
                value={calendarId}
                onChange={(event) => setCalendarId(event.target.value)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="学務カレンダーIDを入力"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                保存する
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100"
              >
                初期設定に戻す
              </button>
            </div>
            {statusMessage ? <p className="text-xs text-green-600">{statusMessage}</p> : null}
          </form>
        ) : (
          <p className="mt-4 text-sm text-neutral-600">設定を読み込み中です...</p>
        )}
        <p className="mt-4 text-xs text-neutral-500">保存した設定はブラウザに記録されます。</p>
      </section>

      <div className="mt-auto border-t border-neutral-200 pt-3 text-center text-xs text-neutral-500">
        <p className="mb-2 font-medium text-neutral-700">開発用メニュー</p>
        <div className="flex flex-col items-center gap-1 text-blue-600">
          <a className="hover:underline" href="/calendar-debug">
            calendar-debug
          </a>
          <a className="hover:underline" href="/timetable_debug">
            timetable_debug
          </a>
        </div>
      </div>
    </div>
  );
}
