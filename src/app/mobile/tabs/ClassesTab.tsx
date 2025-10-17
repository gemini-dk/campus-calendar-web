"use client";

import { useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListUl, faPlus, faTable } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import { useUserSettings } from "@/lib/settings/UserSettingsProvider";
import { useAuth } from "@/lib/useAuth";
import UserHamburgerMenu from "../components/UserHamburgerMenu";

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

  const viewTitle = viewMode === "schedule" ? "時間割" : "授業科目一覧";

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
      <header className="flex h-[60px] w-full items-center border-b border-neutral-200 bg-white px-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-lg font-semibold text-neutral-900">{viewTitle}</div>
          <UserHamburgerMenu buttonAriaLabel="ユーザメニューを開く" />
        </div>
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
      className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
        isActive
          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
      }`}
      aria-pressed={isActive}
    >
      <FontAwesomeIcon icon={icon} fontSize={18} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
