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

  const fiscalYear = settings.calendar.fiscalYear;
  const calendarId = settings.calendar.calendarId;
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
            <p>現在の年度: {fiscalYear || "未設定"}</p>
            <p>利用中のカレンダーID: {calendarId || "未設定"}</p>
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
          fiscalYear={fiscalYear}
          calendarId={calendarId}
          userId={userId}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}
