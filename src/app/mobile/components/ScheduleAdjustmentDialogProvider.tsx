"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faCalendarXmark, faChevronLeft, faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";

import { useAuth } from "@/lib/useAuth";
import { useUserSettings, type CalendarEntry } from "@/lib/settings/UserSettingsProvider";
import {
  updateClassDateSchedule,
  updateClassDateCancellation,
} from "@/lib/data/service/class.service";
import { formatPeriodLabel } from "@/app/mobile/utils/classSchedule";

type PeriodValue = number | "OD";

type ScheduleAdjustmentTarget = {
  classId: string;
  className: string;
  classDateId: string;
  classDate: string;
  periods: PeriodValue[];
  fiscalYear: string;
};

type ScheduleAdjustmentDialogContextValue = {
  openDialog: (target: ScheduleAdjustmentTarget) => void;
  closeDialog: () => void;
};

const ScheduleAdjustmentDialogContext =
  createContext<ScheduleAdjustmentDialogContextValue | null>(null);

export function useScheduleAdjustmentDialog() {
  const value = useContext(ScheduleAdjustmentDialogContext);
  if (!value) {
    throw new Error("useScheduleAdjustmentDialog must be used within ScheduleAdjustmentDialogProvider");
  }
  return value;
}

type ScheduleAdjustmentDialogProviderProps = {
  children: ReactNode;
};

function startOfMonth(dateId: string): Date {
  const parsed = new Date(`${dateId}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(date);
}

function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type CalendarCell = {
  dateId: string;
  label: string;
  inCurrentMonth: boolean;
};

function buildCalendarCells(monthDate: Date): CalendarCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells: CalendarCell[] = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayOffset = index - firstWeekday + 1;
    const cellDate = new Date(year, month, dayOffset);
    cells.push({
      dateId: formatDateId(cellDate),
      label: String(cellDate.getDate()),
      inCurrentMonth: cellDate.getMonth() === month,
    });
  }

  return cells;
}

function sortPeriods(values: PeriodValue[]): PeriodValue[] {
  return values
    .slice()
    .sort((a, b) => {
      if (a === "OD" && b === "OD") {
        return 0;
      }
      if (a === "OD") {
        return 1;
      }
      if (b === "OD") {
        return -1;
      }
      return a - b;
    });
}

export function ScheduleAdjustmentDialogProvider({ children }: ScheduleAdjustmentDialogProviderProps) {
  const [target, setTarget] = useState<ScheduleAdjustmentTarget | null>(null);
  const [activeTab, setActiveTab] = useState<"reschedule" | "cancel">("reschedule");
  const [mounted, setMounted] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState<Date | null>(null);
  const [selectedPeriods, setSelectedPeriods] = useState<PeriodValue[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancellationMode, setCancellationMode] = useState<"present" | "absent" | "exclude">("exclude");

  const { profile } = useAuth();
  const { settings } = useUserSettings();

  useEffect(() => {
    setMounted(true);
  }, []);

  const openDialog = useCallback((nextTarget: ScheduleAdjustmentTarget) => {
    setTarget(nextTarget);
    setActiveTab("reschedule");
    setSelectedDate(nextTarget.classDate);
    setVisibleMonth(startOfMonth(nextTarget.classDate));
    setSelectedPeriods(sortPeriods(nextTarget.periods));
    setActionError(null);
    setSubmitting(false);
    setCancellationMode("exclude");
  }, []);

  const closeDialog = useCallback(() => {
    setTarget(null);
    setSelectedDate(null);
    setVisibleMonth(null);
    setSelectedPeriods([]);
    setActionError(null);
    setSubmitting(false);
    setCancellationMode("exclude");
  }, []);

  useEffect(() => {
    setActionError(null);
  }, [activeTab]);

  const contextValue = useMemo(
    () => ({ openDialog, closeDialog }),
    [closeDialog, openDialog],
  );

  return (
    <ScheduleAdjustmentDialogContext.Provider value={contextValue}>
      {children}
      {mounted && target ? (
        createPortal(
          <div className="fixed inset-0 z-50 flex h-[100svh] w-full items-center justify-center bg-black/40 px-4 py-6">
            <div className="flex h-full max-h-[620px] w-full max-w-[520px] flex-col rounded-3xl bg-white shadow-xl">
              <div className="flex h-16 w-full items-center justify-between border-b border-neutral-200 px-6">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs font-semibold text-blue-600">{target.className}</p>
                  <p className="text-sm font-semibold text-neutral-900">授業日程の変更</p>
                </div>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-lg" aria-hidden="true" />
                  <span className="sr-only">閉じる</span>
                </button>
              </div>
              <div className="flex h-12 w-full items-center px-6">
                <div className="grid h-10 w-full grid-cols-2 overflow-hidden rounded-full border border-neutral-200 bg-neutral-50">
                  <button
                    type="button"
                    onClick={() => setActiveTab("reschedule")}
                    className={`flex h-full items-center justify-center gap-2 text-sm font-semibold transition ${
                      activeTab === "reschedule"
                        ? "text-blue-600"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    <FontAwesomeIcon icon={faCalendarDays} className="text-base" aria-hidden="true" />
                    日程変更
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("cancel")}
                    className={`flex h-full items-center justify-center gap-2 text-sm font-semibold transition ${
                      activeTab === "cancel"
                        ? "text-red-600"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    <FontAwesomeIcon icon={faCalendarXmark} className="text-base" aria-hidden="true" />
                    休講
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6">
                {activeTab === "reschedule" ? (
                  <ScheduleRescheduleTab
                    target={target}
                    selectedDate={selectedDate}
                    onSelectDate={(value) => setSelectedDate(value)}
                    visibleMonth={visibleMonth}
                    onMonthChange={(value) => setVisibleMonth(value)}
                    selectedPeriods={selectedPeriods}
                    onChangePeriods={(values) => setSelectedPeriods(values)}
                    actionError={actionError}
                    userId={profile?.uid ?? null}
                    lessonsPerDayEntries={settings.calendar.entries}
                  />
                ) : (
                  <ScheduleCancellationTab
                    target={target}
                    mode={cancellationMode}
                    onChangeMode={(value) => setCancellationMode(value)}
                    actionError={actionError}
                    userId={profile?.uid ?? null}
                  />
                )}
              </div>
              <div className="flex w-full items-center justify-center border-t border-neutral-200 px-6 py-4">
                {activeTab === "reschedule" ? (
                  <button
                    type="button"
                    className={`flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold transition ${
                      profile?.uid && selectedDate && selectedPeriods.length > 0 && !submitting
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-neutral-200 text-neutral-500"
                    }`}
                    onClick={async () => {
                      if (!profile?.uid || !selectedDate || selectedPeriods.length === 0) {
                        return;
                      }
                      setActionError(null);
                      setSubmitting(true);
                      try {
                        await updateClassDateSchedule({
                          userId: profile.uid,
                          fiscalYear: target.fiscalYear,
                          classId: target.classId,
                          classDateId: target.classDateId,
                          classDate: selectedDate,
                          periods: selectedPeriods,
                        });
                        closeDialog();
                      } catch (err) {
                        console.error("Failed to update schedule", err);
                        setActionError("日程の更新に失敗しました。時間をおいて再度お試しください。");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    disabled={!profile?.uid || !selectedDate || selectedPeriods.length === 0 || submitting}
                  >
                    {submitting ? "変更中..." : "この内容で変更"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold transition ${
                      profile?.uid && !submitting
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-neutral-200 text-neutral-500"
                    }`}
                    onClick={async () => {
                      if (!profile?.uid) {
                        return;
                      }
                      setActionError(null);
                      setSubmitting(true);
                      try {
                        await updateClassDateCancellation({
                          userId: profile.uid,
                          fiscalYear: target.fiscalYear,
                          classId: target.classId,
                          classDateId: target.classDateId,
                          mode: cancellationMode,
                        });
                        closeDialog();
                      } catch (err) {
                        console.error("Failed to cancel class session", err);
                        setActionError("休講の処理に失敗しました。時間をおいて再度お試しください。");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    disabled={!profile?.uid || submitting}
                  >
                    {submitting ? "処理中..." : "休講にする"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      ) : null}
    </ScheduleAdjustmentDialogContext.Provider>
  );
}

type ScheduleRescheduleTabProps = {
  target: ScheduleAdjustmentTarget;
  selectedDate: string | null;
  onSelectDate: (value: string) => void;
  visibleMonth: Date | null;
  onMonthChange: (value: Date) => void;
  selectedPeriods: PeriodValue[];
  onChangePeriods: (values: PeriodValue[]) => void;
  actionError: string | null;
  userId: string | null;
  lessonsPerDayEntries: CalendarEntry[];
};

function ScheduleRescheduleTab({
  target,
  selectedDate,
  onSelectDate,
  visibleMonth,
  onMonthChange,
  selectedPeriods,
  onChangePeriods,
  actionError,
  userId,
  lessonsPerDayEntries,
}: ScheduleRescheduleTabProps) {
  const calendarMonth = useMemo(() => visibleMonth ?? startOfMonth(target.classDate), [target.classDate, visibleMonth]);
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);
  const monthLabel = useMemo(() => formatMonthLabel(calendarMonth), [calendarMonth]);

  const lessonsPerDay = useMemo(() => {
    const entry = lessonsPerDayEntries.find((item) => item.fiscalYear === target.fiscalYear);
    return entry?.lessonsPerDay ?? 6;
  }, [lessonsPerDayEntries, target.fiscalYear]);

  const periodNumbers = useMemo(() => {
    return Array.from({ length: Math.max(lessonsPerDay, 0) }, (_, index) => index + 1);
  }, [lessonsPerDay]);

  const splitIndex = lessonsPerDay <= 6 ? lessonsPerDay : Math.ceil(lessonsPerDay / 2);
  const firstRow = periodNumbers.slice(0, splitIndex);
  const secondRow = lessonsPerDay <= 6 ? [] : periodNumbers.slice(splitIndex);

  const selectedLabel = useMemo(() => {
    if (selectedPeriods.length === 0) {
      return "未選択";
    }
    return formatPeriodLabel(selectedPeriods);
  }, [selectedPeriods]);

  const handleMonthMove = useCallback(
    (delta: number) => {
      const base = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
      onMonthChange(base);
    },
    [calendarMonth, onMonthChange],
  );

  const handleSelectDate = useCallback(
    (dateId: string) => {
      onSelectDate(dateId);
    },
    [onSelectDate],
  );

  const handleTogglePeriod = useCallback(
    (period: PeriodValue) => {
      const exists = selectedPeriods.some((value) => value === period);
      if (exists) {
        onChangePeriods(selectedPeriods.filter((value) => value !== period));
        return;
      }
      onChangePeriods(sortPeriods([...selectedPeriods, period]));
    },
    [onChangePeriods, selectedPeriods],
  );


  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-600 shadow-sm transition hover:bg-neutral-100"
            onClick={() => handleMonthMove(-1)}
            aria-label="前の月へ"
          >
            <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
          </button>
          <div className="flex flex-col items-center gap-1">
            <span className="text-base font-semibold text-neutral-900">{monthLabel}</span>
            <span className="text-xs text-neutral-500">任意の日付を選択してください</span>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-600 shadow-sm transition hover:bg-neutral-100"
            onClick={() => handleMonthMove(1)}
            aria-label="次の月へ"
          >
            <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-neutral-500">
          {"日月火水木金土".split("").map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {calendarCells.map((cell) => {
            const isSelected = selectedDate === cell.dateId;
            return (
              <button
                type="button"
                key={cell.dateId}
                onClick={() => handleSelectDate(cell.dateId)}
                className={`flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold transition ${
                  isSelected
                    ? "bg-blue-600 text-white"
                    : cell.inCurrentMonth
                      ? "bg-white text-neutral-800 hover:bg-blue-50"
                      : "bg-white text-neutral-300"
                }`}
              >
                {cell.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-900">時限を選択</span>
          <span className="text-xs text-neutral-500">{selectedLabel}</span>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <PeriodRow periods={firstRow} selectedPeriods={selectedPeriods} onToggle={handleTogglePeriod} />
          {secondRow.length > 0 ? (
            <PeriodRow periods={secondRow} selectedPeriods={selectedPeriods} onToggle={handleTogglePeriod} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTogglePeriod("OD")}
              className={`flex h-10 flex-1 items-center justify-center rounded-full border text-sm font-semibold transition ${
                selectedPeriods.includes("OD")
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-blue-300"
              }`}
            >
              オンデマンド
            </button>
          </div>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{actionError}</div>
      ) : null}
    </div>
  );
}

type ScheduleCancellationTabProps = {
  target: ScheduleAdjustmentTarget;
  mode: "present" | "absent" | "exclude";
  onChangeMode: (mode: "present" | "absent" | "exclude") => void;
  actionError: string | null;
  userId: string | null;
};

function formatFullDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

const CANCELLATION_OPTIONS: {
  key: "present" | "absent" | "exclude";
  title: string;
  description: string;
}[] = [
  {
    key: "present",
    title: "出席扱いで休講",
    description: "出席数に加算し、休講として表示します。",
  },
  {
    key: "absent",
    title: "欠席扱いで休講",
    description: "欠席数に加算し、休講として表示します。",
  },
  {
    key: "exclude",
    title: "カウント対象から外す",
    description: "出欠集計から除外して休講として表示します。",
  },
];

function ScheduleCancellationTab({
  target,
  mode,
  onChangeMode,
  actionError,
  userId,
}: ScheduleCancellationTabProps) {
  const periodLabel = useMemo(() => formatPeriodLabel(target.periods), [target.periods]);
  const dateLabel = useMemo(() => formatFullDate(target.classDate), [target.classDate]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-neutral-500">対象日程</span>
          <span className="text-base font-semibold text-neutral-900">{dateLabel}</span>
          <span className="text-sm text-neutral-600">{periodLabel}</span>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {CANCELLATION_OPTIONS.map((option) => {
            const selected = mode === option.key;
            return (
              <button
                type="button"
                key={option.key}
                onClick={() => onChangeMode(option.key)}
                className={`flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition ${
                  selected
                    ? "border-blue-500 bg-blue-50"
                    : "border-neutral-200 bg-white hover:border-blue-300"
                }`}
              >
                <span className={`text-sm font-semibold ${selected ? "text-blue-700" : "text-neutral-900"}`}>
                  {option.title}
                </span>
                <span className="mt-1 text-xs text-neutral-500">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{actionError}</div>
      ) : null}
    </div>
  );
}
function PeriodRow({
  periods,
  selectedPeriods,
  onToggle,
}: {
  periods: number[];
  selectedPeriods: PeriodValue[];
  onToggle: (value: PeriodValue) => void;
}) {
  if (periods.length === 0) {
    return null;
  }
  const columnCount = Math.min(Math.max(periods.length, 1), 6);
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
    >
      {periods.map((period) => {
        const selected = selectedPeriods.includes(period);
        return (
          <button
            type="button"
            key={period}
            onClick={() => onToggle(period)}
            className={`flex h-10 items-center justify-center rounded-full border text-sm font-semibold transition ${
              selected
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-blue-300"
            }`}
          >
            {period}限
          </button>
        );
      })}
    </div>
  );
}
