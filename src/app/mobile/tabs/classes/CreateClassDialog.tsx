"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";

import type { CalendarTerm } from "@/lib/data/schema/calendar";
import {
  computeRecommendedMaxAbsence,
  createTimetableClass,
  generateClassDates,
  type GeneratedClassDate,
  type SpecialScheduleOption,
  type WeeklySlotSelection,
} from "@/lib/data/service/class.service";
import { getCalendarTerms } from "@/lib/data/service/calendar.service";

import { TermSettingsDialog, type CalendarOption } from "./TermSettingsDialog";
import { WeeklySlotsDialog } from "./WeeklySlotsDialog";

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
  maxAbsenceTouched: false,
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
]);

const PREVIEW_LIMIT = 8;

type CreateClassDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  calendarOptions: CalendarOption[];
  defaultFiscalYear?: string | null;
  defaultCalendarId?: string | null;
  userId: string | null;
  onCreated?: () => void;
};

function buildCalendarKey(option: CalendarOption): string {
  return `${option.fiscalYear}::${option.calendarId}`;
}

export function CreateClassDialog({
  isOpen,
  onClose,
  calendarOptions,
  defaultFiscalYear,
  defaultCalendarId,
  userId,
  onCreated,
}: CreateClassDialogProps) {
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

  const termCacheRef = useRef<Map<string, CalendarTerm[]>>(new Map());

  const loadTerms = useCallback(async (option: CalendarOption) => {
    const key = buildCalendarKey(option);
    const cached = termCacheRef.current.get(key);
    if (cached) {
      return cached;
    }
    const items = await getCalendarTerms(option.fiscalYear, option.calendarId);
    termCacheRef.current.set(key, items);
    return items;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFormState(INITIAL_FORM_STATE);
    setSaveState("idle");
    setSaveError(null);
    setSaveSuccess(null);
    setScheduleLoadState("idle");
    setScheduleError(null);
    setGeneratedClassDates([]);

    const normalizedYear = defaultFiscalYear?.trim() ?? "";
    const normalizedCalendarId = defaultCalendarId?.trim() ?? "";

    const matched = calendarOptions.find(
      (option) =>
        option.fiscalYear === normalizedYear && option.calendarId === normalizedCalendarId,
    );
    const nextSelected = matched ?? calendarOptions[0] ?? null;
    setSelectedCalendar(nextSelected);
  }, [calendarOptions, defaultCalendarId, defaultFiscalYear, isOpen]);

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
    if (!isOpen) {
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
    const yearText = `${selectedCalendar.fiscalYear}年`;
    const termLabels =
      formState.selectedTermIds.length > 0
        ? formState.selectedTermIds
            .map((termId) => termNameMap.get(termId) ?? termId)
            .join("、")
        : "学期未選択";
    const specialLabel = SPECIAL_SCHEDULE_LABELS[formState.specialOption];
    return `${yearText} ${termLabels} ${specialLabel}`;
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

    if (!formState.isFullyOnDemand) {
      if (formState.selectedTermIds.length === 0) {
        setSaveError("学期を選択してください。");
        setSaveState("error");
        return;
      }
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

      await createTimetableClass({
        userId,
        fiscalYear: selectedCalendar.fiscalYear,
        calendarId: selectedCalendar.calendarId,
        className: formState.className,
        classType: formState.classType,
        location: formState.location,
        teacher: formState.teacher,
        credits: creditsValue,
        creditsStatus: formState.creditsStatus,
        maxAbsenceDays: maxAbsenceValue,
        termIds: formState.selectedTermIds,
        termNames,
        weeklySlots: formState.isFullyOnDemand ? [] : formState.weeklySlots,
        omitWeeklySlots: formState.isFullyOnDemand || formState.weeklySlots.length === 0,
        generatedClassDates: formState.isFullyOnDemand ? [] : generatedClassDates,
      });

      setSaveState("success");
      setSaveSuccess("授業を作成しました。引き続き授業の登録が可能です。");
      setSaveError(null);
      setFormState((prev) => ({
        ...prev,
        className: "",
        location: "",
        teacher: "",
        creditsText: "",
        weeklySlots: prev.isFullyOnDemand ? [] : prev.weeklySlots,
        maxAbsenceTouched: false,
      }));
      if (onCreated) {
        onCreated();
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
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
            <h2 className="text-lg font-semibold text-neutral-900">授業を作成</h2>
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
                    onClick={() => setIsTermDialogOpen(true)}
                    className="rounded border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100"
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
                    disabled={formState.isFullyOnDemand}
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
                  />
                  完全オンデマンド
                </label>
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
            disabled={saveState === "loading"}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {saveState === "loading" ? "保存中..." : "保存する"}
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

export default CreateClassDialog;
