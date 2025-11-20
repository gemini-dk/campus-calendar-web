"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faEye } from "@fortawesome/free-solid-svg-icons";

import type { CalendarTerm } from "@/lib/data/schema/calendar";
import {
  computeRecommendedMaxAbsence,
  createTimetableClass,
  generateClassDates,
  updateTimetableClass,
  type GeneratedClassDate,
  type SpecialScheduleOption,
  type WeeklySlotSelection,
} from "@/lib/data/service/class.service";
import { getCalendarTerms } from "@/lib/data/service/calendar.service";

import { TermSettingsDialog, type CalendarOption } from "./TermSettingsDialog";
import { WeeklySlotsDialog } from "./WeeklySlotsDialog";
import ClassMemoOverlay from "@/app/mobile/components/ClassMemoOverlay";

type LoadState = "idle" | "loading" | "success" | "error";

type FormState = {
  className: string;
  classType: "in_person" | "online" | "hybrid" | "on_demand";
  location: string;
  locationInPerson: string;
  locationOnline: string;
  teacher: string;
  creditsText: string;
  creditsStatus: "in_progress" | "completed" | "failed";
  selectedTermIds: string[];
  specialOption: SpecialScheduleOption;
  weeklySlots: WeeklySlotSelection[];
  isFullyOnDemand: boolean;
  maxAbsenceDays: number;
  maxAbsenceTouched: boolean;
  memo: string;
};

export type CreateClassPresetFormValues = Partial<
  Pick<
    FormState,
    | "className"
    | "classType"
    | "location"
    | "locationInPerson"
    | "locationOnline"
    | "teacher"
    | "creditsText"
    | "creditsStatus"
    | "isFullyOnDemand"
    | "weeklySlots"
    | "maxAbsenceDays"
    | "memo"
  >
>;

const INITIAL_FORM_STATE: FormState = {
  className: "",
  classType: "in_person",
  location: "",
  locationInPerson: "",
  locationOnline: "",
  teacher: "",
  creditsText: "2",
  creditsStatus: "in_progress",
  selectedTermIds: [],
  specialOption: "all",
  weeklySlots: [],
  isFullyOnDemand: false,
  maxAbsenceDays: 0,
  maxAbsenceTouched: false,
  memo: "",
};

const SPECIAL_SCHEDULE_LABELS: Record<SpecialScheduleOption, string> = {
  all: "すべて",
  first_half: "前半週",
  second_half: "後半週",
  odd_weeks: "奇数週",
  even_weeks: "偶数週",
};

type ClassFormMode = "create" | "edit";

export type EditClassInitialData = {
  classId: string;
  className: string;
  classType: FormState["classType"];
  location: string | null;
  locationInPerson: string | null;
  locationOnline: string | null;
  teacher: string | null;
  credits: number | null;
  creditsStatus: FormState["creditsStatus"];
  selectedTermIds: string[];
  specialOption: SpecialScheduleOption;
  weeklySlots: WeeklySlotSelection[];
  isFullyOnDemand: boolean;
  maxAbsenceDays: number;
  originalFiscalYear: string;
  calendarId: string;
  generatedClassDates: GeneratedClassDate[];
  existingWeeklySlotIds: string[];
  existingClassDateIds: string[];
  memo: string | null;
};

const WEEKDAY_LABELS = new Map<number, string>([
  [1, "月"],
  [2, "火"],
  [3, "水"],
  [4, "木"],
  [5, "金"],
  [6, "土"],
]);

const PREVIEW_LIMIT = 8;

type BaseCreateClassDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  calendarOptions: CalendarOption[];
  defaultFiscalYear?: string | null;
  defaultCalendarId?: string | null;
  userId: string | null;
};

type CreateModeProps = {
  mode?: Extract<ClassFormMode, "create">;
  onCreated?: () => void;
  presetFormValues?: CreateClassPresetFormValues;
};

type EditModeProps = {
  mode: Extract<ClassFormMode, "edit">;
  initialData: EditClassInitialData;
  disableScheduleChanges?: boolean;
  onUpdated?: () => void;
};

type CreateDialogPresetProps = {
  presetTermIds?: string[] | null;
  presetWeeklySlots?: WeeklySlotSelection[] | null;
};

type CreateClassDialogProps = BaseCreateClassDialogProps &
  (CreateModeProps | EditModeProps) &
  CreateDialogPresetProps;

function buildCalendarKey(option: CalendarOption): string {
  return `${option.fiscalYear}::${option.calendarId}`;
}

function filterEligibleTerms(terms: CalendarTerm[]): CalendarTerm[] {
  return terms.filter((term) => term.holidayFlag === 2);
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function areWeeklySlotsEqual(a: WeeklySlotSelection[], b: WeeklySlotSelection[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const normalize = (slots: WeeklySlotSelection[]) =>
    slots
      .map((slot) => `${slot.dayOfWeek}-${slot.period}`)
      .sort();
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);
  return normalizedA.every((value, index) => value === normalizedB[index]);
}

function areGeneratedClassDatesEqual(a: GeneratedClassDate[], b: GeneratedClassDate[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const serialize = (items: GeneratedClassDate[]) =>
    items
      .map((item) => `${item.date}::${item.periods.join(',')}`)
      .sort();
  const serializedA = serialize(a);
  const serializedB = serialize(b);
  return serializedA.every((value, index) => value === serializedB[index]);
}

export function CreateClassDialog(props: CreateClassDialogProps) {
  const {
    isOpen,
    onClose,
    calendarOptions,
    defaultFiscalYear,
    defaultCalendarId,
    userId,
    presetTermIds,
    presetWeeklySlots,
  } = props;

  const mode: ClassFormMode = props.mode ?? "create";
  const editProps = mode === "edit" ? (props as BaseCreateClassDialogProps & EditModeProps) : null;
  const isEditMode = editProps !== null;
  const editInitialData = editProps?.initialData ?? null;
  const onCreated = !isEditMode ? (props as BaseCreateClassDialogProps & CreateModeProps).onCreated : undefined;
  const onUpdated = editProps?.onUpdated;
  const scheduleLocked = editProps?.disableScheduleChanges ?? false;
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
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [isTermDialogOpen, setIsTermDialogOpen] = useState(false);
  const [isWeeklyDialogOpen, setIsWeeklyDialogOpen] = useState(false);
  const [isMemoPreviewOpen, setIsMemoPreviewOpen] = useState(false);

  const termCacheRef = useRef<Map<string, CalendarTerm[]>>(new Map());

  useEffect(() => {
    if (scheduleLocked) {
      setIsTermDialogOpen(false);
      setIsWeeklyDialogOpen(false);
    }
  }, [scheduleLocked]);

  const loadTerms = useCallback(async (option: CalendarOption) => {
    const key = buildCalendarKey(option);
    const cached = termCacheRef.current.get(key);
    if (cached) {
      return cached;
    }
    const items = await getCalendarTerms(option.fiscalYear, option.calendarId);
    const filtered = filterEligibleTerms(items);
    termCacheRef.current.set(key, filtered);
    return filtered;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSaveState("idle");
    setSaveError(null);
    setSaveSuccess(null);
    setScheduleError(null);

    if (isEditMode && editInitialData) {
      const fallbackOption: CalendarOption = {
        fiscalYear: editInitialData.originalFiscalYear,
        calendarId: editInitialData.calendarId,
      };
      const matchedOption = calendarOptions.find(
        (option) =>
          option.fiscalYear === editInitialData.originalFiscalYear &&
          option.calendarId === editInitialData.calendarId,
      );

      setSelectedCalendar(matchedOption ?? fallbackOption);
      setFormState({
        className: editInitialData.className,
        classType: editInitialData.classType,
        location: editInitialData.location ?? "",
        locationInPerson:
          editInitialData.locationInPerson ??
          (editInitialData.classType === "hybrid" ? editInitialData.location ?? "" : ""),
        locationOnline:
          editInitialData.locationOnline ??
          (editInitialData.classType === "hybrid" ? editInitialData.location ?? "" : ""),
        teacher: editInitialData.teacher ?? "",
        creditsText:
          typeof editInitialData.credits === "number" && Number.isFinite(editInitialData.credits)
            ? String(editInitialData.credits)
            : "",
        creditsStatus: editInitialData.creditsStatus,
        selectedTermIds: editInitialData.selectedTermIds,
        specialOption: editInitialData.specialOption,
        weeklySlots: editInitialData.weeklySlots,
        isFullyOnDemand: editInitialData.isFullyOnDemand,
        maxAbsenceDays: editInitialData.isFullyOnDemand
          ? 0
          : Math.max(0, Math.trunc(editInitialData.maxAbsenceDays)),
        maxAbsenceTouched: true,
        memo: editInitialData.memo ?? "",
      });
      const hasGeneratedDates = editInitialData.generatedClassDates.length > 0;
      setGeneratedClassDates(editInitialData.isFullyOnDemand ? [] : editInitialData.generatedClassDates);
      setScheduleLoadState(
        editInitialData.isFullyOnDemand ? "idle" : hasGeneratedDates ? "success" : "idle",
      );
      setTermLoadState("idle");
      setTermError(null);
      return;
    }

    const normalizedPresetTerms = Array.isArray(presetTermIds)
      ? presetTermIds.filter((termId) => typeof termId === "string" && termId.trim().length > 0)
      : [];
    const normalizedPresetSlots = Array.isArray(presetWeeklySlots)
      ? presetWeeklySlots
          .filter((slot): slot is WeeklySlotSelection =>
            typeof slot === "object" &&
            slot !== null &&
            typeof slot.dayOfWeek === "number" &&
            typeof slot.period === "number",
          )
          .map((slot) => ({ ...slot }))
      : [];

    const createPresetValues =
      !isEditMode && "presetFormValues" in props
        ? (props as BaseCreateClassDialogProps & CreateModeProps).presetFormValues ?? null
        : null;

  const mergedFormState: FormState = {
    ...INITIAL_FORM_STATE,
    selectedTermIds: normalizedPresetTerms,
    weeklySlots: normalizedPresetSlots,
  };

    if (createPresetValues) {
      mergedFormState.className = createPresetValues.className ?? mergedFormState.className;
      mergedFormState.classType = createPresetValues.classType ?? mergedFormState.classType;
      mergedFormState.location = createPresetValues.location ?? mergedFormState.location;
      mergedFormState.locationInPerson =
        createPresetValues.locationInPerson ?? mergedFormState.locationInPerson;
      mergedFormState.locationOnline = createPresetValues.locationOnline ?? mergedFormState.locationOnline;
      mergedFormState.teacher = createPresetValues.teacher ?? mergedFormState.teacher;
      mergedFormState.creditsText = createPresetValues.creditsText ?? mergedFormState.creditsText;
      mergedFormState.creditsStatus =
        createPresetValues.creditsStatus ?? mergedFormState.creditsStatus;
      mergedFormState.isFullyOnDemand =
        createPresetValues.isFullyOnDemand ?? mergedFormState.isFullyOnDemand;
      mergedFormState.weeklySlots = Array.isArray(createPresetValues.weeklySlots)
        ? createPresetValues.weeklySlots
            .filter(
              (slot): slot is WeeklySlotSelection =>
                typeof slot === "object" &&
                slot !== null &&
                typeof slot.dayOfWeek === "number" &&
                typeof slot.period === "number",
            )
            .map((slot) => ({ ...slot }))
        : mergedFormState.weeklySlots;
      if (
        typeof createPresetValues.maxAbsenceDays === "number" &&
        Number.isFinite(createPresetValues.maxAbsenceDays)
      ) {
        mergedFormState.maxAbsenceDays = Math.max(0, Math.trunc(createPresetValues.maxAbsenceDays));
      }
      mergedFormState.memo = createPresetValues.memo ?? mergedFormState.memo;
    }

    setFormState(mergedFormState);
    setScheduleLoadState("idle");
    setGeneratedClassDates([]);

    const normalizedYear = defaultFiscalYear?.trim() ?? "";
    const normalizedCalendarId = defaultCalendarId?.trim() ?? "";

    const matched = calendarOptions.find(
      (option) =>
        option.fiscalYear === normalizedYear && option.calendarId === normalizedCalendarId,
    );
    const nextSelected = matched ?? calendarOptions[0] ?? null;
    setSelectedCalendar(nextSelected);
  }, [
    calendarOptions,
    defaultCalendarId,
    defaultFiscalYear,
    props,
    editInitialData,
    isEditMode,
    isOpen,
    presetTermIds,
    presetWeeklySlots,
  ]);

  useEffect(() => {
    if (!isOpen) {
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
        selectedTermIds: prev.selectedTermIds.filter((termId) =>
          cached.some((term) => term.id === termId),
        ),
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
        if (!active) {
          return;
        }
        setCalendarTerms(terms);
        setFormState((prev) => ({
          ...prev,
          selectedTermIds: prev.selectedTermIds.filter((termId) =>
            terms.some((term) => term.id === termId),
          ),
        }));
        setTermLoadState("success");
        setTermError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "学期情報の取得に失敗しました。";
        setCalendarTerms([]);
        setTermLoadState("error");
        setTermError(message);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [isOpen, loadTerms, selectedCalendar]);

  useEffect(() => {
    if (!isOpen || scheduleLocked) {
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
          error instanceof Error
            ? error.message
            : "授業日程の生成に失敗しました。時間をおいて再度お試しください。";
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
    isOpen,
    scheduleLocked,
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

  useEffect(() => {
    if (formState.isFullyOnDemand) {
      setFormState((prev) => ({
        ...prev,
        weeklySlots: [],
        maxAbsenceDays: 0,
      }));
      setGeneratedClassDates([]);
      setScheduleLoadState("idle");
      setScheduleError(null);
      return;
    }

    if (!formState.maxAbsenceTouched) {
      setFormState((prev) => ({
        ...prev,
        maxAbsenceDays: recommendedAbsence,
      }));
    }
  }, [formState.isFullyOnDemand, formState.maxAbsenceTouched, recommendedAbsence]);

  if (!isOpen) {
    return null;
  }

  const termSummaryText = useMemo(() => {
    if (!selectedCalendar) {
      return "年度設定が必要です。";
    }
    const parts = [
      `${selectedCalendar.fiscalYear}年`,
      formState.selectedTermIds.length > 0
        ? formState.selectedTermIds
            .map((termId) => termNameMap.get(termId) ?? termId)
            .join("、")
        : "学期未選択",
    ];
    if (formState.specialOption !== "all") {
      parts.push(SPECIAL_SCHEDULE_LABELS[formState.specialOption]);
    }
    return parts.join(" ");
  }, [formState.selectedTermIds, formState.specialOption, selectedCalendar, termNameMap]);

  const slotSummaryText = useMemo(() => {
    if (formState.isFullyOnDemand) {
      return "オンデマンド授業のため曜日・時限の設定は不要です。";
    }
    if (formState.weeklySlots.length === 0) {
      return "曜日・時限が未設定です。";
    }
    return formState.weeklySlots
      .map((slot) => {
        const weekday = WEEKDAY_LABELS.get(slot.dayOfWeek) ?? `${slot.dayOfWeek}`;
        return slot.period === 0 ? `${weekday}オンデマンド` : `${weekday}${slot.period}`;
      })
      .sort((a, b) => a.localeCompare(b))
      .join("、");
  }, [formState.isFullyOnDemand, formState.weeklySlots]);

  const previewDates = generatedClassDates.slice(0, PREVIEW_LIMIT);

  const hasClassName = formState.className.trim().length > 0;
  const hasTermSelection = formState.selectedTermIds.length > 0;
  const hasWeeklyOrOnDemand = formState.isFullyOnDemand || formState.weeklySlots.length > 0;
  const isScheduleReady =
    formState.isFullyOnDemand ||
    (scheduleLoadState === "success" && generatedClassDates.length > 0);
  const canSave =
    hasClassName &&
    hasTermSelection &&
    hasWeeklyOrOnDemand &&
    Boolean(selectedCalendar) &&
    isScheduleReady;
  const isSaveDisabled = saveState === "loading" || !canSave;

  const headerTitle = isEditMode ? "授業を編集" : "授業を作成";
  const saveButtonLabel = saveState === "loading"
    ? isEditMode
      ? "更新中..."
      : "保存中..."
    : isEditMode
      ? "更新する"
      : "保存する";
  const scheduleRestrictionText = scheduleLocked
    ? "出席記録が登録されているため、年度・学期・曜日・時限の変更はできません。"
    : null;

  const handleClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!userId) {
      setSaveError("サインイン後に授業を作成できます。");
      setSaveState("error");
      return;
    }

    if (!selectedCalendar) {
      setSaveError("年度設定を確認してください。");
      setSaveState("error");
      return;
    }

    if (!formState.className.trim()) {
      setSaveError("授業名を入力してください。");
      setSaveState("error");
      return;
    }

    if (formState.selectedTermIds.length === 0) {
      setSaveError("学期を選択してください。");
      setSaveState("error");
      return;
    }

    if (!formState.isFullyOnDemand) {
      if (formState.weeklySlots.length === 0) {
        setSaveError("曜日・時限を選択してください。");
        setSaveState("error");
        return;
      }
      if (scheduleLoadState === "loading") {
        setSaveError("日程生成中です。完了までお待ちください。");
        setSaveState("error");
        return;
      }
      if (generatedClassDates.length === 0 || scheduleLoadState === "error") {
        setSaveError(
          scheduleError ?? "授業日程を生成できませんでした。設定内容を確認してください。",
        );
        setSaveState("error");
        return;
      }
    }

    try {
      setSaveState("loading");
      setSaveError(null);
      setSaveSuccess(null);

      const creditsValue = (() => {
        const trimmed = formState.creditsText.trim();
        if (!trimmed) {
          return null;
        }
        const parsed = Number.parseFloat(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
      })();

      const maxAbsenceValue = formState.isFullyOnDemand
        ? 0
        : Number.isFinite(formState.maxAbsenceDays)
          ? Math.max(0, Math.trunc(formState.maxAbsenceDays))
          : 0;

      const termNames = formState.selectedTermIds.map(
        (termId) => termNameMap.get(termId) ?? termId,
      );

      const weeklySlotsForSave = formState.isFullyOnDemand ? [] : formState.weeklySlots;
      const generatedDatesForSave = formState.isFullyOnDemand ? [] : generatedClassDates;
      const locationForSave = formState.classType === "hybrid" ? "" : formState.location;
      const locationInPersonForSave =
        formState.classType === "hybrid" ? formState.locationInPerson : "";
      const locationOnlineForSave =
        formState.classType === "hybrid" ? formState.locationOnline : "";

      if (isEditMode && editInitialData) {
        const shouldUpdateSchedule = !scheduleLocked &&
          (
            selectedCalendar.fiscalYear !== editInitialData.originalFiscalYear ||
            selectedCalendar.calendarId !== editInitialData.calendarId ||
            !areStringArraysEqual(formState.selectedTermIds, editInitialData.selectedTermIds) ||
            formState.specialOption !== editInitialData.specialOption ||
            formState.isFullyOnDemand !== editInitialData.isFullyOnDemand ||
            (!formState.isFullyOnDemand &&
              !areWeeklySlotsEqual(formState.weeklySlots, editInitialData.weeklySlots)) ||
            (!formState.isFullyOnDemand &&
              !areGeneratedClassDatesEqual(generatedClassDates, editInitialData.generatedClassDates))
          );

        await updateTimetableClass({
          userId,
          classId: editInitialData.classId,
          originalFiscalYear: editInitialData.originalFiscalYear,
          newFiscalYear: selectedCalendar.fiscalYear,
          calendarId: selectedCalendar.calendarId,
          className: formState.className,
          classType: formState.classType,
          isFullyOnDemand: formState.isFullyOnDemand,
          location: locationForSave,
          locationInPerson: locationInPersonForSave,
          locationOnline: locationOnlineForSave,
          teacher: formState.teacher,
          credits: creditsValue,
          creditsStatus: formState.creditsStatus,
          maxAbsenceDays: maxAbsenceValue,
          termIds: formState.selectedTermIds,
          termNames,
          specialOption: formState.specialOption,
          weeklySlots: weeklySlotsForSave,
          generatedClassDates: generatedDatesForSave,
          existingClassDateIds: editInitialData.existingClassDateIds,
          existingWeeklySlotIds: editInitialData.existingWeeklySlotIds,
          shouldUpdateSchedule,
          memo: formState.memo,
        });

        setSaveState("idle");
        setSaveError(null);
        setSaveSuccess(null);
        onUpdated?.();
        onClose();
        return;
      }

      await createTimetableClass({
        userId,
        fiscalYear: selectedCalendar.fiscalYear,
        calendarId: selectedCalendar.calendarId,
        className: formState.className,
        classType: formState.classType,
        isFullyOnDemand: formState.isFullyOnDemand,
        location: locationForSave,
        locationInPerson: locationInPersonForSave,
        locationOnline: locationOnlineForSave,
        teacher: formState.teacher,
        credits: creditsValue,
        creditsStatus: formState.creditsStatus,
        maxAbsenceDays: maxAbsenceValue,
        termIds: formState.selectedTermIds,
        termNames,
        specialOption: formState.specialOption,
        weeklySlots: weeklySlotsForSave,
        generatedClassDates: generatedDatesForSave,
        memo: formState.memo,
      });

      setSaveState("idle");
      setSaveError(null);
      setSaveSuccess(null);
      onCreated?.();
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : isEditMode
            ? "授業の更新に失敗しました。時間をおいて再度お試しください。"
            : "授業の保存に失敗しました。時間をおいて再度お試しください。";
      setSaveState("error");
      setSaveError(message);
      setSaveSuccess(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/40 px-3 py-6">
      <div className="flex h-full max-h-[680px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex h-16 w-full items-center justify-between border-b border-neutral-200 px-5">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{headerTitle}</h2>
            <p className="text-xs text-neutral-500">
              {selectedCalendar
                ? `${selectedCalendar.fiscalYear}年度 / ${selectedCalendar.calendarId}`
                : "年度設定を選択してください。"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-50 px-5 py-6">
          <div className="flex flex-col gap-6">
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-neutral-900">基本情報</h3>
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
                      setFormState((prev) => {
                        const nextType = event.target.value as FormState["classType"];
                        if (nextType === prev.classType) {
                          return prev;
                        }
                        if (nextType === "hybrid") {
                          const nextLocationInPerson =
                            prev.locationInPerson.length > 0
                              ? prev.locationInPerson
                              : prev.location;
                          return {
                            ...prev,
                            classType: nextType,
                            locationInPerson: nextLocationInPerson,
                          };
                        }
                        if (prev.classType === "hybrid") {
                          const fallbackLocation =
                            prev.location.length > 0
                              ? prev.location
                              : prev.locationInPerson.length > 0
                                ? prev.locationInPerson
                                : "";
                          return {
                            ...prev,
                            classType: nextType,
                            location: fallbackLocation,
                            locationInPerson: "",
                            locationOnline: "",
                          };
                        }
                        return {
                          ...prev,
                          classType: nextType,
                        };
                      })
                    }
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="in_person">対面</option>
                    <option value="online">オンライン</option>
                    <option value="hybrid">ハイブリッド</option>
                    <option value="on_demand">オンデマンド</option>
                  </select>
                </label>
                {formState.classType === "hybrid" ? (
                  <>
                    <label className="flex w-full flex-col gap-2">
                      <span className="text-sm font-medium text-neutral-700">場所（対面）</span>
                      <input
                        type="text"
                        value={formState.locationInPerson}
                        onChange={(event) =>
                          setFormState((prev) => ({
                            ...prev,
                            locationInPerson: event.target.value,
                          }))
                        }
                        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="例: 3号館201教室"
                      />
                    </label>
                    <label className="flex w-full flex-col gap-2">
                      <span className="text-sm font-medium text-neutral-700">場所（オンライン）</span>
                      <input
                        type="text"
                        value={formState.locationOnline}
                        onChange={(event) =>
                          setFormState((prev) => ({
                            ...prev,
                            locationOnline: event.target.value,
                          }))
                        }
                        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="例: Zoom ミーティング URL"
                      />
                    </label>
                  </>
                ) : (
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
                )}
                <label className="flex w-full flex-col gap-2">
                  <span className="text-sm font-medium text-neutral-700">教師</span>
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
                <div className="flex w-full flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-700">メモ（任意）</span>
                    {formState.memo.trim().length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setIsMemoPreviewOpen(true)}
                        className="flex items-center gap-1 rounded border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100"
                      >
                        <FontAwesomeIcon icon={faEye} className="text-xs" />
                        プレビュー
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    value={formState.memo}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        memo: event.target.value,
                      }))
                    }
                    className="min-h-[72px] w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="例: オンラインのみ・課題多め など"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-neutral-900">日程設定</h3>
              <div className="mt-4 flex flex-col gap-4">
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
                    onClick={() => {
                      if (scheduleLocked) {
                        return;
                      }
                      setIsTermDialogOpen(true);
                    }}
                    disabled={scheduleLocked}
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
                    onClick={() => {
                      if (scheduleLocked || formState.isFullyOnDemand) {
                        return;
                      }
                      setIsWeeklyDialogOpen(true);
                    }}
                    disabled={formState.isFullyOnDemand || scheduleLocked}
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
                    className="h-4 w-4"
                    disabled={scheduleLocked}
                  />
                  完全オンデマンド
                </label>
                {scheduleRestrictionText ? (
                  <p className="text-xs text-neutral-500">{scheduleRestrictionText}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-neutral-900">単位・出欠</h3>
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
                <h3 className="text-base font-semibold text-neutral-900">日程プレビュー</h3>
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
                <p className="mt-3 text-sm text-neutral-500">
                  条件を設定すると授業日程がここに表示されます。
                </p>
              )}
            </section>

            {saveState === "error" && saveError ? (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">
                {saveError}
              </div>
            ) : null}
            {saveState === "success" && saveSuccess ? (
              <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
                {saveSuccess}
              </div>
            ) : null}
          </div>
        </div>
        <footer className="flex h-16 w-full items-center justify-end gap-3 border-t border-neutral-200 bg-white px-5">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaveDisabled}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {saveButtonLabel}
          </button>
        </footer>
      </div>

      {isTermDialogOpen && !scheduleLocked ? (
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

      {isWeeklyDialogOpen && !scheduleLocked ? (
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

      <ClassMemoOverlay
        open={isMemoPreviewOpen}
        memo={formState.memo}
        onClose={() => setIsMemoPreviewOpen(false)}
      />
    </div>
  );
}

export default CreateClassDialog;
