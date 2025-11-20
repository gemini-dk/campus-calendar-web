import { useCallback, useEffect, useMemo, useState } from 'react';
import { FirebaseError } from 'firebase/app';

import { useToast } from '@/components/ui/ToastProvider';
import { CalendarEntry, useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';
import { useGoogleCalendarIntegration } from '@/lib/google-calendar/hooks/useGoogleCalendarIntegration';
import { deleteAllUserData } from '@/lib/account/deleteAllUserData';
import { auth } from '@/lib/firebase/client';

const IS_PRODUCTION = 
  (process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development') === 'production';

type UserMenuContentProps = {
  className?: string;
  showInstallPromotion?: boolean;
};

type EditableCalendarEntry = CalendarEntry & {
  lessonsPerDayText: string;
};

type MenuPanel = 'academicCalendarSettings' | 'googleCalendarSettings' | 'accountManagement';

function toEditableEntries(entries: CalendarEntry[]): EditableCalendarEntry[] {
  return entries.map((entry) => ({
    ...entry,
    lessonsPerDayText: String(entry.lessonsPerDay ?? 6),
  }));
}

export default function UserMenuContent({ className, showInstallPromotion = false }: UserMenuContentProps) {
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
  const {
    integration: googleCalendarIntegration,
    loading: googleCalendarLoading,
    error: googleCalendarError,
    syncState: googleSyncState,
    connect: connectGoogleCalendar,
    disconnect: disconnectGoogleCalendar,
    syncNow: syncGoogleCalendarNow,
    refreshCalendarList: refreshGoogleCalendarList,
    updateCalendarSelection: updateGoogleCalendarSelection,
    calendarListLoading: googleCalendarListLoading,
    calendarSelectionSaving: googleCalendarSelectionSaving,
    calendarListError: googleCalendarListError,
    hasSelectedCalendars: hasSelectedGoogleCalendars,
  } = useGoogleCalendarIntegration({ enabled: !IS_PRODUCTION });

  const [entries, setEntries] = useState<EditableCalendarEntry[]>([]);
  const [pendingState, setPendingState] = useState<Record<string, boolean>>({});
  const [changingDefault, setChangingDefault] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MenuPanel | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    setEntries(toEditableEntries(settings.calendar.entries));
  }, [settings.calendar.entries]);

  useEffect(() => {
    setCalendarError(null);
  }, [entries]);

  useEffect(() => {
    const list = googleCalendarIntegration?.calendarList ?? [];
    setSelectedCalendarIds(list.filter((entry) => entry.selected).map((entry) => entry.id));
  }, [googleCalendarIntegration?.calendarList]);

  useEffect(() => {
    if (!googleCalendarIntegration?.refreshToken) {
      return;
    }
    if (googleCalendarLoading || googleCalendarListLoading) {
      return;
    }
    if (googleCalendarIntegration.calendarList && googleCalendarIntegration.calendarList.length > 0) {
      return;
    }
    void refreshGoogleCalendarList();
  }, [
    googleCalendarIntegration?.calendarList,
    googleCalendarIntegration?.refreshToken,
    googleCalendarListLoading,
    googleCalendarLoading,
    refreshGoogleCalendarList,
  ]);

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

  const handleOpenPanel = useCallback((panel: MenuPanel) => {
    setActivePanel(panel);
  }, []);

  const handleClosePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const handleToggleCalendarSelection = useCallback((calendarId: string, checked: boolean) => {
    setSelectedCalendarIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(calendarId);
      } else {
        next.delete(calendarId);
      }
      return Array.from(next);
    });
  }, []);

  const handleSaveCalendarSelection = useCallback(async () => {
    const success = await updateGoogleCalendarSelection(selectedCalendarIds);
    if (success) {
      showToast({ message: '同期するカレンダーを更新しました。', tone: 'success' });
    }
  }, [selectedCalendarIds, showToast, updateGoogleCalendarSelection]);

  const handleRefreshCalendarList = useCallback(async () => {
    await refreshGoogleCalendarList();
  }, [refreshGoogleCalendarList]);

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

  const renderAcademicCalendarSettingsSection = () => (
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
  );

  const renderGoogleCalendarSettingsSection = () => (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-neutral-900">Googleカレンダー連携</h2>
        <p className="text-sm text-neutral-600">
          Googleカレンダーの予定を同期して、学事カレンダーとあわせて確認できます。
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
        {googleCalendarLoading ? (
          <p className="text-neutral-600">連携状況を確認しています...</p>
        ) : googleCalendarIntegration?.refreshToken ? (
          <>
            <p className="text-neutral-800">Googleカレンダーが連携されています。</p>
            <p className="text-xs text-neutral-500">
              最終同期:
              {googleSyncState.lastSyncedAt
                ? ` ${new Date(googleSyncState.lastSyncedAt).toLocaleString('ja-JP')}`
                : ' 未同期'}
            </p>
            {googleSyncState.error ? (
              <p className="text-xs text-red-600">{googleSyncState.error}</p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={syncGoogleCalendarNow}
                disabled={googleSyncState.inProgress}
                className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {googleSyncState.inProgress ? '同期中...' : '今すぐ同期'}
              </button>
              <button
                type="button"
                onClick={disconnectGoogleCalendar}
                className="rounded border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100"
              >
                連携を解除
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-neutral-800">Googleカレンダーは未連携です。</p>
            <p className="text-xs text-neutral-500">
              連携すると授業予定とあわせてGoogleカレンダーの予定が表示されます。
            </p>
            <button
              type="button"
              onClick={connectGoogleCalendar}
              className="mt-2 w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Googleカレンダーと連携
            </button>
          </>
        )}
        {googleCalendarError ? (
          <p className="text-xs text-red-600">{googleCalendarError}</p>
        ) : null}
      </div>

      {googleCalendarIntegration?.refreshToken ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-neutral-900">同期するカレンダー</p>
              <p className="text-xs text-neutral-600">
                Googleカレンダーから同期対象を選びます。チェックを外すと、そのカレンダーの予定は削除されます。
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefreshCalendarList}
              disabled={googleCalendarListLoading || googleCalendarSelectionSaving}
              className="rounded border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:bg-neutral-100"
            >
              {googleCalendarListLoading ? '更新中...' : '一覧を更新'}
            </button>
          </div>

          {googleCalendarListLoading ? (
            <p className="text-sm text-neutral-700">カレンダー一覧を取得しています...</p>
          ) : googleCalendarIntegration.calendarList && googleCalendarIntegration.calendarList.length > 0 ? (
            <div className="flex flex-col gap-2">
              {googleCalendarIntegration.calendarList.map((calendar) => {
                const isSelected = selectedCalendarIds.includes(calendar.id);
                return (
                  <label
                    key={calendar.id}
                    className="flex items-center justify-between gap-3 rounded border border-neutral-200 bg-white px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 rounded"
                        style={{
                          backgroundColor: calendar.backgroundColor ?? '#e5e7eb',
                          border: '1px solid #d4d4d8',
                        }}
                        aria-hidden
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-neutral-800">{calendar.summary}</span>
                        <span className="text-[11px] text-neutral-500">{calendar.id}</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => handleToggleCalendarSelection(calendar.id, event.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-neutral-700">カレンダー一覧を取得してから同期するカレンダーを選択してください。</p>
          )}

          {googleCalendarIntegration.calendarList && googleCalendarIntegration.calendarList.length > 0 ? (
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveCalendarSelection}
                disabled={googleCalendarSelectionSaving}
                className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {googleCalendarSelectionSaving ? '保存中...' : '選択を保存'}
              </button>
              {!hasSelectedGoogleCalendars ? (
                <p className="text-xs text-amber-600">同期するカレンダーを1つ以上選択してください。</p>
              ) : null}
            </div>
          ) : null}

          {googleCalendarListError ? (
            <p className="text-xs text-red-600">{googleCalendarListError}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  const menuButtons = (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-neutral-900">機能メニュー</h2>
        <p className="text-sm text-neutral-600">各ボタンを押すと全画面で詳細設定を開きます。</p>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => handleOpenPanel('academicCalendarSettings')}
          className="w-full rounded border border-neutral-300 px-4 py-3 text-left text-sm font-semibold text-neutral-800 transition hover:border-blue-400 hover:bg-blue-50"
        >
          学事カレンダー設定を開く
        </button>
        {!IS_PRODUCTION ? (
          <button
            type="button"
            onClick={() => handleOpenPanel('googleCalendarSettings')}
            className="w-full rounded border border-neutral-300 px-4 py-3 text-left text-sm font-semibold text-neutral-800 transition hover:border-blue-400 hover:bg-blue-50"
          >
            Googleカレンダー設定を開く
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => handleOpenPanel('accountManagement')}
          className="w-full rounded border border-neutral-300 px-4 py-3 text-left text-sm font-semibold text-neutral-800 transition hover:border-blue-400 hover:bg-blue-50"
        >
          アカウント管理を開く
        </button>
      </div>
    </section>
  );

  const handleDeleteAccount = useCallback(async () => {
    if (!profile?.uid) {
      setDeleteAccountError('ログインしてから退会手続きを行ってください。');
      return;
    }

    const confirmed = window.confirm(
      '全てのデータを削除して退会します。この処理を行うと、再度ログインしてもデータは復元されません。実行しますか？',
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await deleteAllUserData(profile.uid);

      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          await currentUser.delete();
        } catch (authError) {
          if (authError instanceof FirebaseError && authError.code === 'auth/requires-recent-login') {
            setDeleteAccountError('安全のため、再度ログインしてから退会を完了してください。ログアウトしました。');
            await signOut();
            return;
          }

          throw authError;
        }
      }

      showToast({ message: '全てのデータを削除しました。ご利用ありがとうございました。', tone: 'success' });
      await signOut();
      setActivePanel(null);
    } catch (deleteError) {
      console.error('Failed to delete user data', deleteError);
      setDeleteAccountError('データの削除に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsDeletingAccount(false);
    }
  }, [profile?.uid, showToast, signOut]);

  const renderAccountManagementSection = () => (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-neutral-700">
          「データを削除して退会」を選択すると、保存済みの時間割・課題・学事カレンダー設定など全てのデータが削除されます。
        </p>
        <p className="text-sm font-semibold text-red-600">
          全てのデータを削除して退会します。この処理を行うと、再度ログインしてもデータは復元されません。
        </p>
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={isDeletingAccount}
          className="rounded bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {isDeletingAccount ? '削除中...' : 'データを削除して退会'}
        </button>
        {deleteAccountError ? (
          <p className="text-xs text-red-600">{deleteAccountError}</p>
        ) : null}
      </div>
    </section>
  );

  return (
    <>
      <div className={containerClassName}>
        {showInstallPromotion ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-amber-800">スマホにインストールしよう！</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-700">
              ブラウザの共有メニューや設定メニューから「ホーム画面に追加」を選ぶと、アプリのように素早くアクセスでき、メニューがなくなるため画面がより広く使えます。
              ただし、データ移行ができないため、Googleログインしてからホーム画面に追加いただくことをおすすめします。
            </p>
          </section>
        ) : null}
        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          {initializing ? (
            <p className="text-sm text-neutral-600">読み込み中...</p>
          ) : isAnonymous ? (
            <div className="flex flex-col items-start gap-4">
              <div>
                <p className="text-base font-medium text-neutral-900">ゲストとして利用中</p>
                <p className="mt-1 text-sm text-neutral-600">
                  今はゲストとして利用中です。ブラウザを閉じたりキャッシュを消すと、保存したデータがなくなる可能性があります。
                  <br />
                  安心して使い続けるために、Googleアカウントとの連携をお願いします。
                  <br />
                  なお、すでに連携済のアカウントがある場合は、<b>ログアウトしてから</b>そのアカウントでログインし直してください。
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

        {menuButtons}

        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-neutral-900">サポート</h2>
            <p className="text-sm text-neutral-600">
              操作に関する質問やお問い合わせは、以下のサポートページをご確認ください。
            </p>
          </div>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            <li>
              <a
                href="https://campus-calendar.launchfy.site/ja/faq"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                FAQ
              </a>
            </li>
            <li>
              <a
                href="https://campus-calendar.launchfy.site/ja/form"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                お問い合わせ
              </a>
            </li>
            <li>
              <a
                href="https://campus-calendar.launchfy.site/ja/terms-of-use"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                利用規約
              </a>
            </li>
            <li>
              <a
                href="https://campus-calendar.launchfy.site/ja/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                プライバシーポリシー
              </a>
            </li>
          </ul>
        </section>
        <div className='min-h-[300px]'></div>
      </div>

      {activePanel === 'academicCalendarSettings' ? (
        <FullScreenPanel title="学事カレンダー設定" onClose={handleClosePanel}>
          <div className="flex-1 overflow-y-auto bg-neutral-50 p-4">{renderAcademicCalendarSettingsSection()}</div>
        </FullScreenPanel>
      ) : null}

      {activePanel === 'googleCalendarSettings' && !IS_PRODUCTION ? (
        <FullScreenPanel title="Googleカレンダー設定" onClose={handleClosePanel}>
          <div className="flex-1 overflow-y-auto bg-neutral-50 p-4">{renderGoogleCalendarSettingsSection()}</div>
        </FullScreenPanel>
      ) : null}

      {activePanel === 'accountManagement' ? (
        <FullScreenPanel title="アカウント管理" onClose={handleClosePanel}>
          <div className="flex-1 overflow-y-auto bg-neutral-50 p-4">{renderAccountManagementSection()}</div>
        </FullScreenPanel>
      ) : null}
    </>
  );
}

type FullScreenPanelProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

function FullScreenPanel({ title, onClose, children }: FullScreenPanelProps) {
  return (
    <div className="fixed inset-0 z-[60] flex h-[100svh] w-full flex-col bg-white">
      <div className="flex h-[56px] items-center justify-between border-b border-neutral-200 px-4">
        <span className="text-base font-semibold text-neutral-900">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-neutral-200 px-3 py-1 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
        >
          閉じる
        </button>
      </div>
      {children}
    </div>
  );
}
