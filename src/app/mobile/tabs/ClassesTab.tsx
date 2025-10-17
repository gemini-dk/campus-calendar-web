"use client";

import { useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListUl, faPlus, faTable } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import { useUserSettings } from "@/lib/settings/UserSettingsProvider";
import { useAuth } from "@/lib/useAuth";

import ClassScheduleView from "./classes/ClassScheduleView";
import ClassSubjectsListView from "./classes/ClassSubjectsListView";
import { CreateClassDialog } from "./classes/CreateClassDialog";

type ClassesViewMode = "schedule" | "subjects";

export default function ClassesTab() {
  const { settings } = useUserSettings();
  const { profile, isAuthenticated } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ClassesViewMode>("schedule");

  const calendarOptions = settings.calendar.entries ?? [];

  const handleOpenDialog = () => {
    if (!isAuthenticated) {
      return;
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleCreated = () => {
    setIsDialogOpen(false);
  };

  const userId = profile?.uid ?? null;

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="flex h-[88px] w-full flex-col justify-center gap-2 px-6">
        <h1 className="text-xl font-semibold text-neutral-900">授業</h1>
        <p className="text-sm text-neutral-500">時間割や授業科目の情報を確認できます。</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-[160px]">
        {viewMode === "schedule" ? <ClassScheduleView /> : <ClassSubjectsListView />}
      </div>

      <div className="pointer-events-none fixed bottom-[84px] right-6 z-20 flex items-center gap-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-blue-100 bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
          <ViewToggleButton
            icon={faTable}
            label="時間割画面"
            isActive={viewMode === "schedule"}
            onClick={() => setViewMode("schedule")}
          />
          <ViewToggleButton
            icon={faListUl}
            label="授業科目一覧"
            isActive={viewMode === "subjects"}
            onClick={() => setViewMode("subjects")}
          />
        </div>
        <button
          type="button"
          onClick={handleOpenDialog}
          disabled={!isAuthenticated || isDialogOpen}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-white shadow-xl shadow-blue-500/30 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
          aria-label="授業を追加"
        >
          <FontAwesomeIcon icon={faPlus} fontSize={22} />
        </button>
      </div>

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

type ViewToggleButtonProps = {
  icon: IconDefinition;
  label: string;
  isActive: boolean;
  onClick: () => void;
};

function ViewToggleButton({ icon, label, isActive, onClick }: ViewToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
        isActive
          ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
          : "text-neutral-500 hover:bg-neutral-100"
      }`}
    >
      <FontAwesomeIcon icon={icon} fontSize={16} />
      <span>{label}</span>
    </button>
  );
}
