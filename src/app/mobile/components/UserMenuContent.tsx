import { useCallback, useEffect, useMemo, useState } from 'react';

import { CalendarEntry, useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';

type UserMenuContentProps = {
  className?: string;
};

type EditableCalendarEntry = CalendarEntry & {
  lessonsPerDayText: string;
};

function toEditableEntries(entries: CalendarEntry[]): EditableCalendarEntry[] {
  return entries.map((entry) => ({
    ...entry,
    lessonsPerDayText: String(entry.lessonsPerDay ?? 6),
  }));
}

export default function UserMenuContent({ className }: UserMenuContentProps) {
  const {
    profile,
    isAuthenticated,
    isAnonymous,
    initializing,
    isProcessing,
    error,
    successMessage,
    signInWithGoogle,
    signOut,
  } = useAuth();
  const {
    settings,
    initialized,
    updateCalendarEntry,
    setActiveCalendar,
  } = useUserSettings();

  const [entries, setEntries] = useState<EditableCalendarEntry[]>([]);
  const [pendingState, setPendingState] = useState<Record<string, boolean>>({});
  const [changingDefault, setChangingDefault] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(toEditableEntries(settings.calendar.entries));
  }, [settings.calendar.entries]);

  useEffect(() => {
    setCalendarError(null);
  }, [entries]);

  const activeEntry = useMemo(() => {
    return entries.find((entry) => entry.defaultFlag) ?? entries[0] ?? null;
  }, [entries]);

  const feedbackMessage = error
    ? { text: error, className: 'text-red-600' }
    : successMessage
      ? { text: successMessage, className: 'text-green-600' }
      : null;

  const containerClassName = [
    'flex min-h-full flex-col gap-6 bg-neutral-50 p-4 text-neutral-800',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const isEntryUpdating = useCallback(
    (fiscalYear: string) => pendingState[fiscalYear] === true,
    [pendingState],
  );

  const handleLessonsChange = useCallback(
    (entry: EditableCalendarEntry, value: string) => {
      setEntries((prev) =>
        prev.map((item) =>
          item.fiscalYear === entry.fiscalYear
            ? { ...item, lessonsPerDayText: value }
            : item,
        ),
      );

      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return;
      }

      setPendingState((prev) => ({ ...prev, [entry.fiscalYear]: true }));

      void updateCalendarEntry({
        fiscalYear: entry.fiscalYear,
        calendarId: entry.calendarId,
        lessonsPerDay: parsed,
      })
        .then(() => {
          setCalendarError(null);
        })
        .catch((updateError) => {
          console.error('Failed to update lessonsPerDay', updateError);
          setCalendarError('設定の保存に失敗しました。時間をおいて再度お試しください。');
        })
        .finally(() => {
          setPendingState((prev) => ({ ...prev, [entry.fiscalYear]: false }));
        });
    },
    [updateCalendarEntry],
  );

  const handleSaturdayToggle = useCallback(
    (entry: EditableCalendarEntry, checked: boolean) => {
      setEntries((prev) =>
        prev.map((item) =>
          item.fiscalYear === entry.fiscalYear
            ? { ...item, hasSaturdayClasses: checked }
            : item,
        ),
      );

      setPendingState((prev) => ({ ...prev, [entry.fiscalYear]: true }));

      void updateCalendarEntry({
        fiscalYear: entry.fiscalYear,
        calendarId: entry.calendarId,
        hasSaturdayClasses: checked,
      })
        .then(() => {
          setCalendarError(null);
        })
        .catch((updateError) => {
          console.error('Failed to update hasSaturdayClasses', updateError);
          setCalendarError('設定の保存に失敗しました。時間をおいて再度お試しください。');
        })
        .finally(() => {
          setPendingState((prev) => ({ ...prev, [entry.fiscalYear]: false }));
        });
    },
    [updateCalendarEntry],
  );

  const handleChangeDefault = useCallback(
    (entry: EditableCalendarEntry) => {
      if (entry.defaultFlag) {
        return;
      }

      setEntries((prev) =>
        prev.map((item) => ({
          ...item,
          defaultFlag: item.fiscalYear === entry.fiscalYear,
        })),
      );

      setChangingDefault(true);

      void setActiveCalendar(entry.fiscalYear, entry.calendarId)
        .then(() => {
          setCalendarError(null);
        })
        .catch((updateError) => {
          console.error('Failed to set active calendar', updateError);
          setCalendarError('利用中のカレンダーを更新できませんでした。時間をおいて再度お試しください。');
        })
        .finally(() => {
          setChangingDefault(false);
        });
    },
    [setActiveCalendar],
  );

  const renderCalendarEntries = () => {
    if (!initialized) {
      return <p className="mt-4 text-sm text-neutral-600">設定を読み込み中です...</p>;
    }

    if (entries.length === 0) {
      return <p className="mt-4 text-sm text-neutral-600">登録されている学事カレンダーはありません。</p>;
    }

    return (
      <div className="mt-4 flex flex-col gap-4">
        {entries.map((entry) => {
          const fiscalYearLabel = `${entry.fiscalYear}年度`;
          const lessonsDisabled = isProcessing || isEntryUpdating(entry.fiscalYear);
          const saturdayDisabled = lessonsDisabled;
          const radioDisabled = isProcessing || changingDefault || isEntryUpdating(entry.fiscalYear);

          const calendarLink = entry.webId ? `/${encodeURIComponent(entry.webId)}/calendar` : null;

          return (
            <div
              key={`${entry.fiscalYear}-${entry.calendarId}`}
              className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-neutral-700">{fiscalYearLabel}</span>
                <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                  <input
                    type="radio"
                    name="activeCalendarFiscalYear"
                    checked={entry.defaultFlag}
                    onChange={() => handleChangeDefault(entry)}
                    disabled={radioDisabled}
                    className="h-4 w-4"
                  />
                  利用中
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-neutral-500">大学名</span>
                <p className="text-sm text-neutral-800">{entry.universityName || '未登録'}</p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-neutral-500">カレンダー名</span>
                {calendarLink ? (
                  <a
                    href={calendarLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline"
                  >
                    {entry.calendarName || '未登録'}
                  </a>
                ) : (
                  <p className="text-sm text-neutral-800">{entry.calendarName || '未登録'}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-neutral-500">1日の授業数</label>
                <input
                  type="number"
                  value={entry.lessonsPerDayText}
                  onChange={(event) => handleLessonsChange(entry, event.target.value)}
                  disabled={lessonsDisabled}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-neutral-100"
                  min={1}
                />
              </div>
              <label className="flex items-center justify-between gap-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2">
                <span className="text-sm font-medium text-neutral-700">土曜日授業あり</span>
                <input
                  type="checkbox"
                  checked={entry.hasSaturdayClasses}
                  onChange={(event) => handleSaturdayToggle(entry, event.target.checked)}
                  disabled={saturdayDisabled}
                  className="h-4 w-4"
                />
              </label>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={containerClassName}>
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        {initializing ? (
          <p className="text-sm text-neutral-600">読み込み中...</p>
        ) : isAuthenticated ? (
          <div className="flex flex-col items-start gap-4">
            <div>
              <p className="text-base font-medium text-neutral-900">{profile?.displayName ?? 'ユーザ'} さんでログイン中</p>
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
        ) : isAnonymous ? (
          <div className="flex flex-col items-start gap-4">
            <div>
              <p className="text-base font-medium text-neutral-900">ゲストとして利用中</p>
              <p className="mt-1 text-sm text-neutral-600">
                今はゲストとして利用中です。ブラウザを閉じたりキャッシュを消すと、保存したデータがなくなる可能性があります。
                <br />
                安心して使い続けるために、Googleアカウントとの連携をお願いします。
              </p>
            </div>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={isProcessing}
              className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isProcessing ? '処理中...' : 'Googleログイン'}
            </button>
            <button
              type="button"
              onClick={signOut}
              disabled={isProcessing}
              className="w-full rounded border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
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
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-neutral-900">学事カレンダー設定</h2>
          <p className="text-sm text-neutral-600">
            登録した学事カレンダーの授業数や土曜日授業の有無を変更すると、直ちにFirestoreへ保存されます。
          </p>
        </div>
        {activeEntry ? (
          <div className="mt-4 flex flex-col gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <span className="text-xs font-medium text-neutral-600">利用中のカレンダー</span>
            <span className="text-sm text-neutral-800">
              {`${activeEntry.universityName || '未登録'} / ${activeEntry.calendarName || '未登録'} / ${activeEntry.fiscalYear}年度`}
            </span>
          </div>
        ) : null}
        {renderCalendarEntries()}
        {calendarError ? (
          <p className="mt-3 text-xs text-red-600">{calendarError}</p>
        ) : null}
        <div className="mt-6">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded border border-dashed border-neutral-300 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:border-blue-400 hover:bg-blue-50"
          >
            カレンダーを追加
          </a>
        </div>
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
