"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";

import type { CalendarDay, CalendarTerm } from "@/lib/data/schema/calendar";
import {
  computeRecommendedMaxAbsence,
  createTimetableClass,
  generateClassDatesFromDays,
  type GeneratedClassDate,
  type SpecialScheduleOption,
  type WeeklySlotSelection,
} from "@/lib/data/service/class.service";
import { getCalendarDays, getCalendarTerms } from "@/lib/data/service/calendar.service";

const WEEKDAYS = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
] as const;

const PERIODS = [
  { value: 1, label: "1限" },
  { value: 2, label: "2限" },
  { value: 3, label: "3限" },
  { value: 4, label: "4限" },
  { value: 5, label: "5限" },
  { value: 6, label: "6限" },
  { value: 0, label: "オンデマンド" },
] as const;

const SPECIAL_SCHEDULE_OPTIONS: { value: SpecialScheduleOption; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "first_half", label: "前半週" },
  { value: "second_half", label: "後半週" },
  { value: "odd_weeks", label: "奇数週" },
  { value: "even_weeks", label: "偶数週" },
];

type CreateClassDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  fiscalYear: string;
  calendarId: string;
  userId: string | null;
  onCreated?: () => void;
};

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

export function CreateClassDialog({
  isOpen,
  onClose,
  fiscalYear,
  calendarId,
  userId,
  onCreated,
}: CreateClassDialogProps) {
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
  const [terms, setTerms] = useState<CalendarTerm[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarLoadState, setCalendarLoadState] = useState<LoadState>("idle");
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<LoadState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const termNameMap = useMemo(() => {
    return terms.reduce<Map<string, string>>((map, term) => {
      map.set(term.id, term.name);
      return map;
    }, new Map());
  }, [terms]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFormState(INITIAL_FORM_STATE);
    setSaveState("idle");
    setSaveError(null);
    setSaveSuccess(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (!fiscalYear.trim() || !calendarId.trim()) {
      setCalendarLoadState("error");
      setCalendarError("年度とカレンダーIDを設定してください。");
      return;
    }

    let isActive = true;

    const load = async () => {
      try {
        setCalendarLoadState("loading");
        setCalendarError(null);
        const [termItems, dayItems] = await Promise.all([
          getCalendarTerms(fiscalYear, calendarId),
          getCalendarDays(fiscalYear, calendarId),
        ]);
        if (!isActive) {
          return;
        }
        setTerms(termItems);
        setCalendarDays(dayItems);
        setCalendarLoadState("success");
      } catch (error) {
        if (!isActive) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "学事カレンダーの取得に失敗しました。";
        setTerms([]);
        setCalendarDays([]);
        setCalendarError(message);
        setCalendarLoadState("error");
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [calendarId, fiscalYear, isOpen]);

  const generatedClassDates: GeneratedClassDate[] = useMemo(() => {
    if (!isOpen) {
      return [];
    }
    if (formState.isFullyOnDemand) {
      return [];
    }
    if (calendarLoadState !== "success") {
      return [];
    }
    if (formState.selectedTermIds.length === 0) {
      return [];
    }
    if (formState.weeklySlots.length === 0) {
      return [];
    }
    return generateClassDatesFromDays({
      days: calendarDays,
      termIds: formState.selectedTermIds,
      weeklySlots: formState.weeklySlots,
      specialOption: formState.specialOption,
    });
  }, [
    calendarDays,
    calendarLoadState,
    formState.isFullyOnDemand,
    formState.selectedTermIds,
    formState.specialOption,
    formState.weeklySlots,
    isOpen,
  ]);

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

  const handleToggleTerm = (termId: string) => {
    setFormState((prev) => {
      const exists = prev.selectedTermIds.includes(termId);
      return {
        ...prev,
        selectedTermIds: exists
          ? prev.selectedTermIds.filter((id) => id !== termId)
          : [...prev.selectedTermIds, termId],
      };
    });
  };

  const handleToggleSlot = (slot: WeeklySlotSelection) => {
    setFormState((prev) => {
      const key = `${slot.dayOfWeek}-${slot.period}`;
      const exists = prev.weeklySlots.some(
        (item) => `${item.dayOfWeek}-${item.period}` === key,
      );
      return {
        ...prev,
        weeklySlots: exists
          ? prev.weeklySlots.filter(
              (item) => `${item.dayOfWeek}-${item.period}` !== key,
            )
          : [...prev.weeklySlots, slot],
      };
    });
  };

  const handleClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!userId) {
      setSaveError("サインイン後に授業を作成できます。");
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
      if (generatedClassDates.length === 0) {
        setSaveError("授業日程を生成できませんでした。学期や曜日の選択を確認してください。");
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
        fiscalYear,
        calendarId,
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

  const selectedTermNames = formState.selectedTermIds.map(
    (termId) => termNameMap.get(termId) ?? termId,
  );

  const selectedSlotSummaries = useMemo(() => {
    const weekdayMap = new Map<number, string>(WEEKDAYS.map((item) => [item.value, item.label]));
    return formState.weeklySlots
      .map((slot) => {
        const weekday = weekdayMap.get(slot.dayOfWeek) ?? `${slot.dayOfWeek}曜日`;
        const periodLabel =
          slot.period === 0
            ? "オンデマンド"
            : `${slot.period}限`;
        return `${weekday} ${periodLabel}`;
      })
      .sort();
  }, [formState.weeklySlots]);

  const previewDates = generatedClassDates.slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/40 px-3 py-6">
      <div className="flex h-full max-h-[680px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex h-16 w-full items-center justify-between border-b border-neutral-200 px-5">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">授業を作成</h2>
            <p className="text-xs text-neutral-500">
              年度 {fiscalYear} / カレンダー {calendarId}
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
                    placeholder="教室名やURL"
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
                    placeholder="担当教員名"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold text-neutral-900">日程設定</h3>
                <p className="text-xs text-neutral-500">
                  学期と曜日・時限を選択すると、学務カレンダーから授業日程を自動生成します。
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-700">学期選択</span>
                    <span className="text-xs text-neutral-500">
                      {calendarLoadState === "loading"
                        ? "読み込み中..."
                        : calendarLoadState === "error"
                          ? "学期を取得できませんでした"
                          : `${formState.selectedTermIds.length}件選択`}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {terms.map((term) => {
                      const checked = formState.selectedTermIds.includes(term.id);
                      return (
                        <label
                          key={term.id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                            checked
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                          }`}
                        >
                          <span className="font-medium">{term.name}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleTerm(term.id)}
                            className="h-4 w-4"
                          />
                        </label>
                      );
                    })}
                    {terms.length === 0 && calendarLoadState === "success" ? (
                      <p className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500">
                        学期情報が見つかりませんでした。
                      </p>
                    ) : null}
                    {calendarLoadState === "error" && calendarError ? (
                      <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">
                        {calendarError}
                      </p>
                    ) : null}
                  </div>
                </div>

                <label className="flex w-full flex-col gap-2">
                  <span className="text-sm font-medium text-neutral-700">特殊日程</span>
                  <select
                    value={formState.specialOption}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        specialOption: event.target.value as SpecialScheduleOption,
                      }))
                    }
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {SPECIAL_SCHEDULE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-700">曜日・時限</span>
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
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50">
                    <div className="grid grid-cols-7 gap-2 p-3 text-xs text-neutral-700">
                      <div className="flex items-center justify-center font-semibold text-neutral-500">
                        時限/曜日
                      </div>
                      {WEEKDAYS.map((weekday) => (
                        <div
                          key={weekday.value}
                          className="flex items-center justify-center font-semibold"
                        >
                          {weekday.label}
                        </div>
                      ))}
                      {PERIODS.map((period) => (
                        <Fragment key={period.value}>
                          <div className="flex items-center justify-center rounded border border-neutral-200 bg-white px-2 py-2 font-semibold text-neutral-700">
                            {period.label}
                          </div>
                          {WEEKDAYS.map((weekday) => {
                            const key = `${weekday.value}-${period.value}`;
                            const isSelected = formState.weeklySlots.some(
                              (slot) => `${slot.dayOfWeek}-${slot.period}` === key,
                            );
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  handleToggleSlot({
                                    dayOfWeek: weekday.value,
                                    period: period.value,
                                  })
                                }
                                disabled={formState.isFullyOnDemand}
                                className={`flex h-10 w-full items-center justify-center rounded border text-sm transition ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-100 text-blue-700"
                                    : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                                } ${formState.isFullyOnDemand ? "opacity-40" : ""}`}
                              >
                                {isSelected ? "選択中" : "-"}
                              </button>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  {!formState.isFullyOnDemand ? (
                    <div className="text-xs text-neutral-600">
                      選択済み: {selectedSlotSummaries.length > 0 ? selectedSlotSummaries.join(", ") : "未選択"}
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-500">オンデマンド授業のため曜日・時限の選択は不要です。</div>
                  )}
                </div>
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
                  <span className="text-xs text-neutral-500">
                    推奨値: {recommendedAbsence} 回
                  </span>
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
                <h3 className="text-base font-semibold text-neutral-900">生成結果プレビュー</h3>
                <span className="text-xs text-neutral-500">
                  {formState.isFullyOnDemand
                    ? "オンデマンドのため日程生成なし"
                    : `生成件数: ${generatedClassDates.length} 日`}
                </span>
              </div>
              {!formState.isFullyOnDemand && generatedClassDates.length > 0 ? (
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
                          .join(", ")}
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
    </div>
  );
}

export default CreateClassDialog;
