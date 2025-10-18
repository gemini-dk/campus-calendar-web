"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faFloppyDisk, faLock } from "@fortawesome/free-solid-svg-icons";
import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import type { CalendarTerm } from "@/lib/data/schema/calendar";
import {
  computeRecommendedMaxAbsence,
  generateClassDates,
  updateTimetableClass,
  type GeneratedClassDate,
  type SpecialScheduleOption,
  type WeeklySlotSelection,
} from "@/lib/data/service/class.service";
import { getCalendarTerms } from "@/lib/data/service/calendar.service";
import { db } from "@/lib/firebase/client";
import { useUserSettings } from "@/lib/settings/UserSettingsProvider";
import { useAuth } from "@/lib/useAuth";

import { TermSettingsDialog, type CalendarOption } from "@/app/mobile/tabs/classes/TermSettingsDialog";
import { WeeklySlotsDialog } from "@/app/mobile/tabs/classes/WeeklySlotsDialog";

type LoadState = "idle" | "loading" | "success" | "error";

type FormState = {
  className: string;
  classType: "in_person" | "online" | "hybrid" | "on_demand";
  location: string;
  teacher: string;
  creditsText: string;
  creditsStatus: "in_progress" | "completed" | "failed";
  selectedTermIds: string[];
  specialOption: SpecialScheduleOption;
  weeklySlots: WeeklySlotSelection[];
  isFullyOnDemand: boolean;
  maxAbsenceDays: number;
  maxAbsenceTouched: boolean;
};

const INITIAL_FORM_STATE: FormState = {
  className: "",
  classType: "in_person",
  location: "",
  teacher: "",
  creditsText: "",
  creditsStatus: "in_progress",
  selectedTermIds: [],
  specialOption: "all",
  weeklySlots: [],
  isFullyOnDemand: false,
  maxAbsenceDays: 0,
  maxAbsenceTouched: true,
};

const SPECIAL_SCHEDULE_LABELS: Record<SpecialScheduleOption, string> = {
  all: "すべて",
  first_half: "前半週",
  second_half: "後半週",
  odd_weeks: "奇数週",
  even_weeks: "偶数週",
};

const WEEKDAY_LABELS = new Map<number, string>([
  [1, "月"],
  [2, "火"],
  [3, "水"],
  [4, "木"],
  [5, "金"],
  [6, "土"],
  [7, "日"],
]);

const CREDIT_STATUS_VALUES = new Set(["in_progress", "completed", "failed"]);
const CLASS_TYPE_VALUES = new Set(["in_person", "online", "hybrid", "on_demand"]);
const ATTENDANCE_STATUS_VALUES = new Set(["present", "late", "absent"]);

const PREVIEW_LIMIT = 8;

function buildCalendarKey(option: CalendarOption): string {
  return `${option.fiscalYear}::${option.calendarId}`;
}

function filterEligibleTerms(terms: CalendarTerm[]): CalendarTerm[] {
  return terms.filter((term) => term.holidayFlag === 2);
}

function formatSlotSummary(slots: WeeklySlotSelection[], isFullyOnDemand: boolean): string {
  if (isFullyOnDemand) {
    return "オンデマンド授業のため設定不要です。";
  }
  if (slots.length === 0) {
    return "曜日・時限が未設定です。";
  }
  const grouped = new Map<number, Set<number>>();
  slots.forEach((slot) => {
    const list = grouped.get(slot.dayOfWeek) ?? new Set<number>();
    list.add(slot.period);
    grouped.set(slot.dayOfWeek, list);
  });
  const parts = Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([day, periods]) => {
      const weekday = WEEKDAY_LABELS.get(day) ?? `${day}`;
      const sorted = Array.from(periods.values()).sort((a, b) => a - b);
      const label = sorted
        .map((period) => (period <= 0 ? "オンデマンド" : `${period}限`))
        .join("・");
      return `${weekday}曜${label}`;
    });
  return parts.length > 0 ? parts.join(" / ") : "曜日・時限が未設定です。";
}

export default function EditClassPage() {
  const params = useParams<{ classId?: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { profile, initializing: authInitializing, isAuthenticated } = useAuth();
  const { settings } = useUserSettings();

  const classIdParam = typeof params?.classId === "string" ? params.classId : null;
  const classId = classIdParam && classIdParam.trim().length > 0 ? classIdParam.trim() : null;

  const fiscalYearParam = searchParams.get("fiscalYear");

  const userId = profile?.uid ?? null;

  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarOption | null>(null);
  const [calendarTerms, setCalendarTerms] = useState<CalendarTerm[]>([]);
  const [termLoadState, setTermLoadState] = useState<LoadState>("idle");
  const [termError, setTermError] = useState<string | null>(null);
  const [generatedClassDates, setGeneratedClassDates] = useState<GeneratedClassDate[]>([]);
  const [scheduleLoadState, setScheduleLoadState] = useState<LoadState>("idle");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<LoadState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTermDialogOpen, setIsTermDialogOpen] = useState(false);
  const [isWeeklyDialogOpen, setIsWeeklyDialogOpen] = useState(false);
  const [initialLoadState, setInitialLoadState] = useState<LoadState>("idle");
  const [initialError, setInitialError] = useState<string | null>(null);
  const [attendanceLocked, setAttendanceLocked] = useState(false);
  const [currentFiscalYear, setCurrentFiscalYear] = useState<string | null>(null);
  const [existingCreatedAt, setExistingCreatedAt] = useState<Timestamp | null>(null);
  const [initialTermNameEntries, setInitialTermNameEntries] = useState<[string, string][]>([]);

  const termCacheRef = useRef<Map<string, CalendarTerm[]>>(new Map());

  const baseCalendarOptions = useMemo<CalendarOption[]>(() => {
    const entries = settings.calendar.entries ?? [];
    return entries.map((entry) => ({ fiscalYear: entry.fiscalYear, calendarId: entry.calendarId }));
  }, [settings.calendar.entries]);

  const calendarOptions = useMemo<CalendarOption[]>(() => {
    const map = new Map<string, CalendarOption>();
    baseCalendarOptions.forEach((option) => {
      map.set(buildCalendarKey(option), option);
    });
    if (selectedCalendar) {
      const key = buildCalendarKey(selectedCalendar);
      if (!map.has(key)) {
        map.set(key, selectedCalendar);
      }
    }
    return Array.from(map.values());
  }, [baseCalendarOptions, selectedCalendar]);

  const fallbackTermNameMap = useMemo(() => new Map(initialTermNameEntries), [initialTermNameEntries]);

  const loadTerms = useCallback(async (option: CalendarOption) => {
    const key = buildCalendarKey(option);
    const cached = termCacheRef.current.get(key);
    if (cached) {
      return cached;
    }
    const terms = await getCalendarTerms(option.fiscalYear, option.calendarId);
    const filtered = filterEligibleTerms(terms);
    termCacheRef.current.set(key, filtered);
    return filtered;
  }, []);

  useEffect(() => {
    if (!classId || !userId) {
      setInitialLoadState(userId ? "idle" : "idle");
      return;
    }

    const normalizedFiscalYear = fiscalYearParam?.trim();
    if (!normalizedFiscalYear) {
      setInitialLoadState("error");
      setInitialError("年度情報が見つかりません。授業一覧から開き直してください。");
      return;
    }

    let active = true;

    const run = async () => {
      try {
        setInitialLoadState("loading");
        setInitialError(null);

        const classRef = doc(
          db,
          "users",
          userId,
          "academic_years",
          normalizedFiscalYear,
          "timetable_classes",
          classId,
        );

        const [classSnapshot, weeklySnapshot, datesSnapshot] = await Promise.all([
          getDoc(classRef),
          getDocs(collection(classRef, "weekly_slots")),
          getDocs(collection(classRef, "class_dates")),
        ]);

        if (!classSnapshot.exists()) {
          throw new Error("授業情報が見つかりません。");
        }

        const data = classSnapshot.data();
        const className = typeof data.className === "string" ? data.className.trim() : "";
        if (!className) {
          throw new Error("授業情報が見つかりません。");
        }

        const typeValue = typeof data.classType === "string" ? data.classType : "in_person";
        const classType: FormState["classType"] = CLASS_TYPE_VALUES.has(typeValue)
          ? (typeValue as FormState["classType"])
          : "in_person";

        const location = typeof data.location === "string" ? data.location : "";
        const teacher = typeof data.teacher === "string" ? data.teacher : "";

        const creditsValue =
          typeof data.credits === "number" && Number.isFinite(data.credits) ? data.credits : null;
        const creditsStatusValue = typeof data.creditsStatus === "string" ? data.creditsStatus : "in_progress";
        const creditsStatus: FormState["creditsStatus"] = CREDIT_STATUS_VALUES.has(creditsStatusValue)
          ? (creditsStatusValue as FormState["creditsStatus"])
          : "in_progress";

        const termIds = Array.isArray(data.termIds)
          ? data.termIds
              .map((termId) => (typeof termId === "string" ? termId.trim() : ""))
              .filter((termId) => termId.length > 0)
          : [];

        const termNames = Array.isArray(data.termNames)
          ? data.termNames
              .map((term) => (typeof term === "string" ? term.trim() : ""))
              .filter((term) => term.length > 0)
          : [];

        const specialValue = typeof data.specialScheduleOption === "string" ? data.specialScheduleOption : "all";
        const specialOption: SpecialScheduleOption = SPECIAL_SCHEDULE_LABELS[specialValue as SpecialScheduleOption]
          ? (specialValue as SpecialScheduleOption)
          : "all";

        const isFullyOnDemand = data.isFullyOnDemand === true;
        const maxAbsenceRaw =
          typeof data.maxAbsenceDays === "number" && Number.isFinite(data.maxAbsenceDays)
            ? Math.max(0, Math.trunc(data.maxAbsenceDays))
            : 0;

        const calendarIdValue = typeof data.calendarId === "string" ? data.calendarId.trim() : "";
        const fiscalYearValue =
          typeof data.fiscalYear === "number" && Number.isFinite(data.fiscalYear)
            ? String(Math.trunc(data.fiscalYear))
            : normalizedFiscalYear;

        const weeklySlots = weeklySnapshot.docs
          .map((docSnapshot) => {
            const slotData = docSnapshot.data();
            const dayOfWeek =
              typeof slotData.dayOfWeek === "number" && Number.isFinite(slotData.dayOfWeek)
                ? Math.trunc(slotData.dayOfWeek)
                : null;
            const period =
              typeof slotData.period === "number" && Number.isFinite(slotData.period)
                ? Math.trunc(slotData.period)
                : null;
            if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 7 || period === null) {
              return null;
            }
            return { dayOfWeek, period } satisfies WeeklySlotSelection;
          })
          .filter((slot): slot is WeeklySlotSelection => slot !== null);

        const hasAttendance = datesSnapshot.docs.some((docSnapshot) => {
          const dateData = docSnapshot.data();
          const status = dateData.attendanceStatus;
          return typeof status === "string" && ATTENDANCE_STATUS_VALUES.has(status);
        });

        if (!active) {
          return;
        }

        setFormState({
          className,
          classType,
          location,
          teacher,
          creditsText: creditsValue !== null ? String(creditsValue) : "",
          creditsStatus,
          selectedTermIds: termIds,
          specialOption,
          weeklySlots,
          isFullyOnDemand,
          maxAbsenceDays: isFullyOnDemand ? 0 : maxAbsenceRaw,
          maxAbsenceTouched: true,
        });
        setSelectedCalendar({ fiscalYear: fiscalYearValue, calendarId: calendarIdValue });
        setCurrentFiscalYear(normalizedFiscalYear);
        setAttendanceLocked(hasAttendance);
        setInitialTermNameEntries(termIds.map((termId, index) => [termId, termNames[index] ?? termId]));
        setExistingCreatedAt(data.createdAt instanceof Timestamp ? data.createdAt : null);
        setGeneratedClassDates([]);
        setScheduleLoadState("idle");
        setScheduleError(null);
        setInitialLoadState("success");
        setInitialError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "授業情報の取得に失敗しました。時間をおいて再度お試しください。";
        setInitialLoadState("error");
        setInitialError(message);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [classId, fiscalYearParam, userId]);
  useEffect(() => {
    if (initialLoadState !== "success") {
      return;
    }
    if (!selectedCalendar) {
      setCalendarTerms([]);
      setTermLoadState("error");
      setTermError("年度設定が必要です。ユーザ設定から追加してください。");
      return;
    }

    const key = buildCalendarKey(selectedCalendar);
    const cached = termCacheRef.current.get(key);
    if (cached) {
      setCalendarTerms(cached);
      setFormState((prev) => ({
        ...prev,
        selectedTermIds: prev.selectedTermIds.filter((termId) => cached.some((term) => term.id === termId)),
      }));
      setTermLoadState("success");
      setTermError(null);
      return;
    }

    let active = true;

    const run = async () => {
      try {
        setTermLoadState("loading");
        setTermError(null);
        const terms = await loadTerms(selectedCalendar);
        const filtered = filterEligibleTerms(terms);
        if (!active) {
          return;
        }
        termCacheRef.current.set(key, filtered);
        setCalendarTerms(filtered);
        setFormState((prev) => ({
          ...prev,
          selectedTermIds: prev.selectedTermIds.filter((termId) =>
            filtered.some((term) => term.id === termId),
          ),
        }));
        setTermLoadState("success");
      } catch (error) {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "学期情報の取得に失敗しました。時間をおいて再度お試しください。";
        setCalendarTerms([]);
        setTermLoadState("error");
        setTermError(message);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [initialLoadState, loadTerms, selectedCalendar]);

  useEffect(() => {
    if (initialLoadState !== "success") {
      return;
    }
    if (formState.isFullyOnDemand) {
      setFormState((prev) => {
        if (prev.weeklySlots.length === 0 && prev.maxAbsenceDays === 0) {
          return prev;
        }
        return {
          ...prev,
          weeklySlots: [],
          maxAbsenceDays: 0,
        };
      });
      setGeneratedClassDates([]);
      setScheduleLoadState("idle");
      setScheduleError(null);
      return;
    }

    if (!formState.maxAbsenceTouched) {
      setFormState((prev) => {
        if (prev.maxAbsenceTouched) {
          return prev;
        }
        return {
          ...prev,
          maxAbsenceDays: computeRecommendedMaxAbsence(generatedClassDates.length),
        };
      });
    }
  }, [formState.isFullyOnDemand, formState.maxAbsenceTouched, generatedClassDates.length, initialLoadState]);

  useEffect(() => {
    if (initialLoadState !== "success") {
      return;
    }
    if (formState.isFullyOnDemand) {
      setGeneratedClassDates([]);
      setScheduleLoadState("idle");
      setScheduleError(null);
      return;
    }
    if (!selectedCalendar) {
      setGeneratedClassDates([]);
      setScheduleLoadState("idle");
      setScheduleError(null);
      return;
    }
    if (formState.selectedTermIds.length === 0 || formState.weeklySlots.length === 0) {
      setGeneratedClassDates([]);
      setScheduleLoadState("idle");
      setScheduleError(null);
      return;
    }

    let active = true;

    const run = async () => {
      try {
        setScheduleLoadState("loading");
        setScheduleError(null);
        const dates = await generateClassDates({
          fiscalYear: selectedCalendar.fiscalYear,
          calendarId: selectedCalendar.calendarId,
          termIds: formState.selectedTermIds,
          weeklySlots: formState.weeklySlots,
          specialOption: formState.specialOption,
        });
        if (!active) {
          return;
        }
        setGeneratedClassDates(dates);
        setScheduleLoadState("success");
      } catch (error) {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "授業日程の生成に失敗しました。時間をおいて再度お試しください。";
        setGeneratedClassDates([]);
        setScheduleLoadState("error");
        setScheduleError(message);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [
    formState.isFullyOnDemand,
    formState.selectedTermIds,
    formState.specialOption,
    formState.weeklySlots,
    initialLoadState,
    selectedCalendar,
  ]);

  const termNameMap = useMemo(() => {
    return calendarTerms.reduce<Map<string, string>>((map, term) => {
      map.set(term.id, term.name);
      return map;
    }, new Map());
  }, [calendarTerms]);

  const recommendedAbsence = useMemo(() => {
    if (formState.isFullyOnDemand) {
      return 0;
    }
    return computeRecommendedMaxAbsence(generatedClassDates.length);
  }, [formState.isFullyOnDemand, generatedClassDates.length]);

  const termSummaryText = useMemo(() => {
    if (!selectedCalendar) {
      return "年度設定が必要です。";
    }
    const termLabels =
      formState.selectedTermIds.length > 0
        ? formState.selectedTermIds
            .map((termId) => termNameMap.get(termId) ?? fallbackTermNameMap.get(termId) ?? termId)
            .join("、")
        : "学期未選択";
    const parts = [`${selectedCalendar.fiscalYear}年`, termLabels];
    if (formState.specialOption !== "all") {
      parts.push(SPECIAL_SCHEDULE_LABELS[formState.specialOption]);
    }
    return parts.join(" / ");
  }, [fallbackTermNameMap, formState.selectedTermIds, formState.specialOption, selectedCalendar, termNameMap]);

  const slotSummaryText = useMemo(
    () => formatSlotSummary(formState.weeklySlots, formState.isFullyOnDemand),
    [formState.isFullyOnDemand, formState.weeklySlots],
  );

  const previewDates = useMemo(
    () => generatedClassDates.slice(0, PREVIEW_LIMIT),
    [generatedClassDates],
  );

  const headerSubLabel = selectedCalendar
    ? `${selectedCalendar.fiscalYear}年度 / ${selectedCalendar.calendarId}`
    : "年度設定を選択してください。";

  const isSaveDisabled =
    saveState === "loading" || initialLoadState !== "success" || !isAuthenticated || !classId || !userId;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);
  const handleSave = useCallback(async () => {
    if (!classId) {
      setSaveState("error");
      setSaveError("授業IDが見つかりません。");
      return;
    }
    if (!userId) {
      setSaveState("error");
      setSaveError("サインイン後に編集できます。ユーザタブからサインインしてください。");
      return;
    }
    if (!selectedCalendar) {
      setSaveState("error");
      setSaveError("年度設定を選択してください。");
      return;
    }
    if (!currentFiscalYear) {
      setSaveState("error");
      setSaveError("現在の年度情報を取得できませんでした。");
      return;
    }

    const trimmedName = formState.className.trim();
    if (!trimmedName) {
      setSaveState("error");
      setSaveError("授業名を入力してください。");
      return;
    }

    if (!attendanceLocked) {
      if (formState.selectedTermIds.length === 0) {
        setSaveState("error");
        setSaveError("学期を選択してください。");
        return;
      }
      if (!formState.isFullyOnDemand) {
        if (formState.weeklySlots.length === 0) {
          setSaveState("error");
          setSaveError("曜日・時限を選択してください。");
          return;
        }
        if (scheduleLoadState === "loading") {
          setSaveState("error");
          setSaveError("日程生成中です。完了までお待ちください。");
          return;
        }
        if (generatedClassDates.length === 0 || scheduleLoadState === "error") {
          setSaveState("error");
          setSaveError(scheduleError ?? "授業日程を生成できませんでした。設定内容を確認してください。");
          return;
        }
      }
    }

    const creditsValue = (() => {
      const trimmed = formState.creditsText.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number.parseFloat(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    })();

    const termNames = formState.selectedTermIds.map(
      (termId) => termNameMap.get(termId) ?? fallbackTermNameMap.get(termId) ?? termId,
    );

    setSaveState("loading");
    setSaveError(null);

    try {
      await updateTimetableClass({
        userId,
        classId,
        currentFiscalYear,
        targetFiscalYear: selectedCalendar.fiscalYear,
        calendarId: selectedCalendar.calendarId,
        className: formState.className,
        classType: formState.classType,
        isFullyOnDemand: formState.isFullyOnDemand,
        location: formState.location,
        teacher: formState.teacher,
        credits: creditsValue,
        creditsStatus: formState.creditsStatus,
        maxAbsenceDays: formState.isFullyOnDemand ? 0 : formState.maxAbsenceDays,
        termIds: formState.selectedTermIds,
        termNames,
        specialOption: formState.specialOption,
        weeklySlots: formState.isFullyOnDemand ? [] : formState.weeklySlots,
        generatedClassDates: formState.isFullyOnDemand ? [] : generatedClassDates,
        updateSchedule: !attendanceLocked,
        existingCreatedAt,
      });

      const query = new URLSearchParams();
      query.set("fiscalYear", selectedCalendar.fiscalYear);
      router.push(`/mobile/classes/${classId}/activity?${query.toString()}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "授業情報の更新に失敗しました。時間をおいて再度お試しください。";
      setSaveState("error");
      setSaveError(message);
    } finally {
      setSaveState("idle");
    }
  }, [
    attendanceLocked,
    classId,
    currentFiscalYear,
    existingCreatedAt,
    fallbackTermNameMap,
    formState.className,
    formState.classType,
    formState.creditsStatus,
    formState.creditsText,
    formState.isFullyOnDemand,
    formState.location,
    formState.maxAbsenceDays,
    formState.selectedTermIds,
    formState.specialOption,
    formState.teacher,
    formState.weeklySlots,
    generatedClassDates,
    router,
    scheduleError,
    scheduleLoadState,
    selectedCalendar,
    termNameMap,
    userId,
  ]);
  const renderContent = () => {
    if (authInitializing || initialLoadState === "loading") {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/70 px-4 py-10 text-sm text-neutral-600">
          読み込み中です...
        </div>
      );
    }

    if (!isAuthenticated || !userId) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/70 px-4 py-10 text-sm text-neutral-600">
          授業を編集するにはログインしてください。ユーザタブからサインインできます。
        </div>
      );
    }

    if (!classId) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/70 px-4 py-10 text-sm text-neutral-600">
          授業が指定されていません。
        </div>
      );
    }

    if (initialLoadState === "error") {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/70 px-4 py-10 text-sm text-red-600">
          {initialError ?? "授業情報の取得に失敗しました。"}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-neutral-900">基本情報</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex w-full flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">授業名</span>
              <input
                type="text"
                value={formState.className}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    className: event.target.value,
                  }))
                }
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="例: プログラミング演習"
              />
            </label>
            <label className="flex w-full flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">授業タイプ</span>
              <select
                value={formState.classType}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    classType: event.target.value as FormState["classType"],
                  }))
                }
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="in_person">対面</option>
                <option value="online">オンライン</option>
                <option value="hybrid">ハイブリッド</option>
                <option value="on_demand">オンデマンド</option>
              </select>
            </label>
            <label className="flex w-full flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">場所</span>
              <input
                type="text"
                value={formState.location}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    location: event.target.value,
                  }))
                }
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="例: 3号館201教室"
              />
            </label>
            <label className="flex w-full flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">担当教員</span>
              <input
                type="text"
                value={formState.teacher}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    teacher: event.target.value,
                  }))
                }
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="例: 山田 太郎"
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">日程設定</h2>
              {attendanceLocked ? (
                <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                  <FontAwesomeIcon icon={faLock} className="text-xs" aria-hidden="true" />
                  出席記録あり
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-700">年度・学期・特殊日程</p>
                  <p className="mt-1 text-xs text-neutral-500">{termSummaryText}</p>
                  {termLoadState === "error" && termError ? (
                    <p className="mt-1 text-xs text-red-600">{termError}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setIsTermDialogOpen(true)}
                  disabled={attendanceLocked}
                  className="rounded border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400"
                >
                  変更
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-700">曜日・時限</p>
                  <p className="mt-1 text-xs text-neutral-500">{slotSummaryText}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWeeklyDialogOpen(true)}
                  disabled={attendanceLocked || formState.isFullyOnDemand}
                  className="rounded border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400"
                >
                  変更
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs text-neutral-600">
                <input
                  type="checkbox"
                  checked={formState.isFullyOnDemand}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      isFullyOnDemand: event.target.checked,
                    }))
                  }
                  disabled={attendanceLocked}
                  className="h-4 w-4"
                />
                完全オンデマンド
              </label>
            </div>
            {attendanceLocked ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                出席記録が登録されているため、年度・学期・曜日時限の変更はできません。
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-neutral-900">単位・出欠</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex w-full flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">最大欠席可能日数</span>
              <input
                type="number"
                value={formState.maxAbsenceDays}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    maxAbsenceDays: Number.parseInt(event.target.value, 10) || 0,
                    maxAbsenceTouched: true,
                  }))
                }
                disabled={formState.isFullyOnDemand}
                className={`w-full rounded border px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                  formState.isFullyOnDemand
                    ? "border-neutral-200 bg-neutral-100 text-neutral-500"
                    : "border-neutral-300"
                }`}
              />
              <span className="text-xs text-neutral-500">推奨値: {recommendedAbsence} 回</span>
            </label>
            <label className="flex w-full flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">単位数</span>
              <input
                type="text"
                value={formState.creditsText}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    creditsText: event.target.value,
                  }))
                }
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="例: 2"
              />
            </label>
            <label className="flex w-full flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">取得状況</span>
              <select
                value={formState.creditsStatus}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    creditsStatus: event.target.value as FormState["creditsStatus"],
                  }))
                }
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="in_progress">履修中</option>
                <option value="completed">修得済み</option>
                <option value="failed">未修得</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900">日程プレビュー</h2>
            <span className="text-xs text-neutral-500">
              {formState.isFullyOnDemand
                ? "オンデマンドのため日程生成なし"
                : scheduleLoadState === "loading"
                  ? "生成中..."
                  : `生成件数: ${generatedClassDates.length} 日`}
            </span>
          </div>
          {formState.isFullyOnDemand ? (
            <p className="mt-3 text-sm text-neutral-500">オンデマンド授業のため日程生成は行いません。</p>
          ) : scheduleLoadState === "error" ? (
            <p className="mt-3 text-sm text-red-600">
              {scheduleError ?? "授業日程の生成に失敗しました。"}
            </p>
          ) : generatedClassDates.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              {previewDates.map((item) => (
                <li
                  key={item.date}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2"
                >
                  <span>{item.date}</span>
                  <span className="text-xs text-neutral-500">
                    {item.periods
                      .map((period) => (period === "OD" ? "オンデマンド" : `${period}限`))
                      .join("、")}
                  </span>
                </li>
              ))}
              {generatedClassDates.length > previewDates.length ? (
                <li className="text-xs text-neutral-500">
                  ほか {generatedClassDates.length - previewDates.length} 件
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">条件を設定すると授業日程がここに表示されます。</p>
          )}
        </section>

        {saveState === "error" && saveError ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">{saveError}</div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex min-h-[100svh] w-full justify-center bg-neutral-100">
      <div className="mx-auto flex h-full min-h-[100svh] w-full max-w-3xl flex-col bg-white">
        <header className="flex h-[60px] w-full items-center justify-between border-b border-neutral-200 px-4">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="前の画面に戻る"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-lg font-semibold text-neutral-900">授業情報を編集</h1>
            <p className="text-xs text-neutral-500">{headerSubLabel}</p>
          </div>
          <div className="h-9 w-9" aria-hidden="true" />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-4 py-6">{renderContent()}</div>

        <footer className="flex h-16 w-full items-center justify-end gap-3 border-t border-neutral-200 bg-white px-4">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaveDisabled}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            <FontAwesomeIcon icon={faFloppyDisk} className="text-sm" aria-hidden="true" />
            {saveState === "loading" ? "更新中..." : "更新する"}
          </button>
        </footer>
      </div>

      {isTermDialogOpen ? (
        <TermSettingsDialog
          isOpen={isTermDialogOpen}
          onClose={() => setIsTermDialogOpen(false)}
          calendarOptions={calendarOptions}
          initialOption={selectedCalendar}
          initialTermIds={formState.selectedTermIds}
          initialSpecialOption={formState.specialOption}
          initialTerms={calendarTerms}
          loadTerms={loadTerms}
          onApply={({ option, termIds, specialOption }) => {
            setIsTermDialogOpen(false);
            if (!option) {
              setSelectedCalendar(null);
              setCalendarTerms([]);
              setTermLoadState("error");
              setTermError("年度設定が必要です。ユーザ設定から追加してください。");
              setFormState((prev) => ({
                ...prev,
                selectedTermIds: termIds,
                specialOption,
              }));
              return;
            }

            setSelectedCalendar(option);
            setFormState((prev) => ({
              ...prev,
              selectedTermIds: termIds,
              specialOption,
            }));

            const cached = termCacheRef.current.get(buildCalendarKey(option));
            if (cached) {
              setCalendarTerms(cached);
              setTermLoadState("success");
              setTermError(null);
            }
          }}
        />
      ) : null}

      {isWeeklyDialogOpen ? (
        <WeeklySlotsDialog
          isOpen={isWeeklyDialogOpen}
          onClose={() => setIsWeeklyDialogOpen(false)}
          initialSlots={formState.weeklySlots}
          onApply={(slots) => {
            setIsWeeklyDialogOpen(false);
            setFormState((prev) => ({
              ...prev,
              weeklySlots: slots,
            }));
          }}
        />
      ) : null}
    </div>
  );
}
