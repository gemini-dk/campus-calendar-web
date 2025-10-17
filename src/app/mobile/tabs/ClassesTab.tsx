"use client";

import { useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";

import { useUserSettings } from "@/lib/settings/UserSettingsProvider";
import { useAuth } from "@/lib/useAuth";

import { CreateClassDialog } from "./classes/CreateClassDialog";

export default function ClassesTab() {
  const { settings } = useUserSettings();
  const { profile, isAuthenticated } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const calendarOptions = settings.calendar.entries ?? [];
  const activeCalendar = calendarOptions.find(
    (entry) =>
      entry.fiscalYear === settings.calendar.fiscalYear &&
      entry.calendarId === settings.calendar.calendarId,
  );

  const handleOpenDialog = () => {
    setStatusMessage(null);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleCreated = () => {
    setStatusMessage("授業を作成しました。必要に応じて一覧を更新してください。");
  };

  const userId = profile?.uid ?? null;

  return (
    <div className="relative flex min-h-full w-full flex-col bg-neutral-50">
      <div className="flex-1 px-5 py-6">
        <div className="flex h-full w-full flex-col rounded-2xl border border-dashed border-neutral-300 bg-white/70 p-6 text-sm text-neutral-600">
          <h2 className="text-lg font-semibold text-neutral-800">授業作成</h2>
          <p className="mt-2 text-sm">
            学期設定と曜日・時限を指定すると、学務カレンダーに基づき授業日程を自動登録します。右下のボタンから授業を追加してください。
          </p>
          <div className="mt-4 space-y-2 text-xs text-neutral-500">
            <p>
              利用中の年度: {activeCalendar ? activeCalendar.fiscalYear : "未設定"}
            </p>
            <p>
              利用中のカレンダーID: {activeCalendar ? activeCalendar.calendarId : "未設定"}
            </p>
            <div>
              <p>登録済みの年度一覧:</p>
              {calendarOptions.length > 0 ? (
                <ul className="mt-1 list-inside list-disc space-y-1 text-[11px] text-neutral-500">
                  {calendarOptions.map((option) => (
                    <li key={`${option.fiscalYear}-${option.calendarId}`}>
                      {option.fiscalYear} / {option.calendarId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[11px]">未登録</p>
              )}
            </div>
            <p>{isAuthenticated ? `${profile?.displayName ?? "ユーザ"} としてログイン中です。` : "授業を作成するにはログインが必要です。"}</p>
          </div>
          {statusMessage ? (
            <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
              {statusMessage}
            </div>
          ) : null}
          <div className="mt-auto text-xs text-neutral-400">
            作成した授業は年度別に Firestore の timetable_classes コレクションへ保存されます。
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleOpenDialog}
        disabled={isDialogOpen}
        className="absolute bottom-6 right-6 z-40 flex h-14 w-56 items-center justify-center gap-3 rounded-full bg-blue-600 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        <FontAwesomeIcon icon={faPlus} />
        授業を追加
      </button>

      {isDialogOpen ? (
        <CreateClassDialog
          isOpen={isDialogOpen}
          onClose={handleCloseDialog}
          calendarOptions={calendarOptions}
          defaultFiscalYear={settings.calendar.fiscalYear}
          defaultCalendarId={settings.calendar.calendarId}
          userId={userId}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}
