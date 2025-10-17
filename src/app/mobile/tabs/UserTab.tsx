'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';

export default function UserTab() {
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
  type EditableCalendarEntry = {
    id: string;
    fiscalYear: string;
    calendarId: string;
  };

  const toEditableEntries = (entries: { fiscalYear: string; calendarId: string }[]): EditableCalendarEntry[] =>
    entries.map((entry, index) => ({
      id: `${entry.fiscalYear}-${entry.calendarId}-${index}`,
      fiscalYear: entry.fiscalYear,
      calendarId: entry.calendarId,
    }));

  const [entries, setEntries] = useState<EditableCalendarEntry[]>(
    toEditableEntries(settings.calendar.entries),
  );
  const [activeIndex, setActiveIndex] = useState(() => {
    const initialIndex = settings.calendar.entries.findIndex(
      (entry) =>
        entry.fiscalYear === settings.calendar.fiscalYear &&
        entry.calendarId === settings.calendar.calendarId,
    );
    return initialIndex >= 0 ? initialIndex : 0;
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setEntries(toEditableEntries(settings.calendar.entries));
    const nextIndex = settings.calendar.entries.findIndex(
      (entry) =>
        entry.fiscalYear === settings.calendar.fiscalYear &&
        entry.calendarId === settings.calendar.calendarId,
    );
    setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
  }, [settings.calendar]);

  useEffect(() => {
    setStatusMessage(null);
  }, [entries, activeIndex]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sanitizedEntries = entries.map((entry) => ({
      fiscalYear: entry.fiscalYear,
      calendarId: entry.calendarId,
    }));
    const target = sanitizedEntries[activeIndex] ?? sanitizedEntries[0] ?? {
      fiscalYear: '',
      calendarId: '',
    };
    saveCalendarSettings({
      fiscalYear: target.fiscalYear,
      calendarId: target.calendarId,
      entries: sanitizedEntries,
    });
    setStatusMessage('保存しました。');
  };

  const handleReset = () => {
    resetCalendarSettings();
    setStatusMessage('初期設定に戻しました。');
  };

  const handleAddEntry = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fiscalYear: '',
        calendarId: '',
      },
    ]);
    setActiveIndex((prevActive) => (prevActive === -1 ? 0 : prevActive));
  };

  const handleRemoveEntry = (id: string) => {
    setEntries((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      const next = prev.filter((entry) => entry.id !== id);
      if (next.length === prev.length) {
        return prev;
      }
      setActiveIndex((prevActive) => {
        if (prevActive >= next.length) {
          return next.length - 1;
        }
        const removedIndex = prev.findIndex((entry) => entry.id === id);
        if (removedIndex >= 0 && removedIndex === prevActive) {
          return Math.max(0, prevActive - 1);
        }
        return prevActive;
      });
      return next;
    });
  };

  const handleChangeEntry = (id: string, patch: Partial<EditableCalendarEntry>) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  };

  const activeEntryLabel = useMemo(() => {
    const entry = entries[activeIndex];
    if (!entry) {
      return '未設定';
    }
    return `${entry.fiscalYear || '年度未設定'} / ${entry.calendarId || 'ID未設定'}`;
  }, [activeIndex, entries]);

  const feedbackMessage = error
    ? { text: error, className: 'text-red-600' }
    : successMessage
      ? { text: successMessage, className: 'text-green-600' }
      : null;

  return (
    <div className="flex min-h-full flex-col gap-6 bg-neutral-50 p-4 text-neutral-800">
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
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <span className="text-xs font-medium text-neutral-600">利用中の設定</span>
              <span className="text-sm text-neutral-800">{activeEntryLabel}</span>
              <span className="text-xs text-neutral-500">
                下の一覧から年度を追加し、利用中に設定してください。
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                      <input
                        type="radio"
                        name="activeCalendarEntry"
                        checked={activeIndex === index}
                        onChange={() => setActiveIndex(index)}
                        className="h-4 w-4"
                      />
                      利用中に設定
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(entry.id)}
                      disabled={entries.length <= 1}
                      className="text-xs font-semibold text-red-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:text-neutral-300"
                    >
                      削除
                    </button>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-neutral-700">年度 (YYYY)</span>
                    <input
                      type="text"
                      value={entry.fiscalYear}
                      onChange={(event) =>
                        handleChangeEntry(entry.id, { fiscalYear: event.target.value })
                      }
                      className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="2025"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-neutral-700">学事カレンダーID</span>
                    <input
                      type="text"
                      value={entry.calendarId}
                      onChange={(event) =>
                        handleChangeEntry(entry.id, { calendarId: event.target.value })
                      }
                      className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="学務カレンダーIDを入力"
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddEntry}
                className="w-full rounded border border-dashed border-neutral-300 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:border-blue-400 hover:bg-blue-50"
              >
                年度を追加
              </button>
            </div>
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
