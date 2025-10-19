"use client";

import { useEffect, ChangeEvent, useMemo, useState } from "react";

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

type CalendarEntry = {
  fiscalYear: string;
  calendarId: string;
  lessonsPerDay: number;
  hasSaturdayClasses: boolean;
};

function buildCalendarKey(entry: CalendarEntry): string {
  return `${entry.fiscalYear}::${entry.calendarId}`;
}

export default function ClassesTab() {
  const { settings, saveCalendarSettings } = useUserSettings();
  const { profile, isAuthenticated } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ClassesViewMode>("schedule");

  const calendarEntries = settings.calendar.entries ?? [];

  const calendarSelectionOptions = useMemo(() => {
    return calendarEntries.map((entry) => ({
      ...entry,
      key: buildCalendarKey(entry),
      label: `${entry.fiscalYear}年度`,
    }));
  }, [calendarEntries]);

  const activeCalendarKey = useMemo(() => {
    const key = `${settings.calendar.fiscalYear}::${settings.calendar.calendarId}`;
    const exists = calendarSelectionOptions.some((option) => option.key === key);
    if (exists) {
      return key;
    }
    return calendarSelectionOptions[0]?.key ?? "";
  }, [calendarSelectionOptions, settings.calendar.calendarId, settings.calendar.fiscalYear]);

  const [selectedCalendarKey, setSelectedCalendarKey] = useState(activeCalendarKey);

  useEffect(() => {
    setSelectedCalendarKey(activeCalendarKey);
  }, [activeCalendarKey]);

  useEffect(() => {
    setSelectedCalendarKey((prev) => {
      if (prev && calendarSelectionOptions.some((option) => option.key === prev)) {
        return prev;
      }
      return activeCalendarKey;
    });
  }, [activeCalendarKey, calendarSelectionOptions]);

  const selectedCalendarEntry: CalendarEntry | null = useMemo(() => {
    const matched = calendarEntries.find((entry) => buildCalendarKey(entry) === selectedCalendarKey);
    if (matched) {
      return matched;
    }
    return calendarEntries[0] ?? null;
  }, [calendarEntries, selectedCalendarKey]);

  const fiscalYearOptions = useMemo(() => {
    const years = Array.from(
      new Set((settings.calendar.entries ?? []).map((entry) => entry.fiscalYear)),
    );
    return years.sort((a, b) => b.localeCompare(a));
  }, [settings.calendar.entries]);

  const handleChangeCalendar = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextKey = event.target.value;
    setSelectedCalendarKey(nextKey);

    const matchedEntry = calendarEntries.find((entry) => buildCalendarKey(entry) === nextKey);
    if (!matchedEntry) {
      return;
    }

    saveCalendarSettings({
      fiscalYear: matchedEntry.fiscalYear,
      calendarId: matchedEntry.calendarId,
      entries: settings.calendar.entries,
    });
  };

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
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-neutral-50">
      <header className="flex h-[60px] w-full items-center border-b border-neutral-200 bg-[var(--color-my-secondary-container)] px-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-lg font-semibold text-neutral-900">{viewTitle}</div>
            <div className="flex items-center gap-2">
              <label htmlFor="classes-calendar-select" className="text-xs font-medium text-neutral-500">
                年度
              </label>
              <select
                id="classes-calendar-select"
                value={selectedCalendarKey}
                onChange={handleChangeCalendar}
                className="h-9 w-[140px] rounded-full border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 transition focus:border-blue-500 focus:outline-none"
                aria-label="表示する年度を選択"
                disabled={calendarSelectionOptions.length === 0}
              >
                {calendarSelectionOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <UserHamburgerMenu buttonAriaLabel="ユーザメニューを開く" />
        </div>
      </header>

      <div
        className={`flex flex-1 min-h-0 flex-col overflow-y-auto ${
          viewMode === "schedule" ? "" : "px-6"
        }`}
      >
        {viewMode === "schedule" ? (
          <ClassScheduleView calendar={selectedCalendarEntry} />
        ) : (
          <ClassSubjectsListView fiscalYear={selectedCalendarEntry?.fiscalYear ?? null} />
        )}
      </div>

      <div className="pointer-events-none fixed bottom-[72px] right-4 z-20 flex items-center gap-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-neutral-200 bg-white/95 px-2.5 py-2 backdrop-blur">
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
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          aria-label="授業を追加"
        >
          <FontAwesomeIcon icon={faPlus} fontSize={20} />
        </button>
      </div>

      {isDialogOpen ? (
        <CreateClassDialog
          isOpen={isDialogOpen}
          onClose={handleCloseDialog}
          calendarOptions={calendarEntries}
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
          ? "bg-blue-600 text-white"
          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
      }`}
      aria-pressed={isActive}
    >
      <FontAwesomeIcon icon={icon} fontSize={18} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
