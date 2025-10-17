"use client";

import { useEffect, useMemo, useState } from "react";

import type { CalendarTerm } from "@/lib/data/schema/calendar";
import type { SpecialScheduleOption } from "@/lib/data/service/class.service";

type LoadState = "idle" | "loading" | "success" | "error";

export type CalendarOption = {
  fiscalYear: string;
  calendarId: string;
};

type TermSettingsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  calendarOptions: CalendarOption[];
  initialOption: CalendarOption | null;
  initialTermIds: string[];
  initialSpecialOption: SpecialScheduleOption;
  initialTerms: CalendarTerm[];
  loadTerms: (option: CalendarOption) => Promise<CalendarTerm[]>;
  onApply: (params: {
    option: CalendarOption | null;
    termIds: string[];
    specialOption: SpecialScheduleOption;
  }) => void;
};

const SPECIAL_SCHEDULE_LABELS: Record<SpecialScheduleOption, string> = {
  all: "すべて",
  first_half: "前半週",
  second_half: "後半週",
  odd_weeks: "奇数週",
  even_weeks: "偶数週",
};

export function TermSettingsDialog({
  isOpen,
  onClose,
  calendarOptions,
  initialOption,
  initialTermIds,
  initialSpecialOption,
  initialTerms,
  loadTerms,
  onApply,
}: TermSettingsDialogProps) {
  const [selectedOption, setSelectedOption] = useState<CalendarOption | null>(initialOption);
  const [selectedTermIds, setSelectedTermIds] = useState<string[]>(initialTermIds);
  const [selectedSpecialOption, setSelectedSpecialOption] = useState<SpecialScheduleOption>(
    initialSpecialOption,
  );
  const [terms, setTerms] = useState<CalendarTerm[]>(initialTerms);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSelectedOption(initialOption ?? calendarOptions[0] ?? null);
    setSelectedTermIds(initialTermIds);
    setSelectedSpecialOption(initialSpecialOption);
    setTerms(initialTerms);
    setLoadState(initialTerms.length > 0 ? "success" : "idle");
    setErrorMessage(null);
  }, [
    calendarOptions,
    initialOption,
    initialSpecialOption,
    initialTermIds,
    initialTerms,
    isOpen,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (!selectedOption) {
      setTerms([]);
      setLoadState("error");
      setErrorMessage("年度設定が見つかりません。設定画面から年度を追加してください。");
      return;
    }

    const key = `${selectedOption.fiscalYear}::${selectedOption.calendarId}`;
    if (terms.length > 0 && initialOption) {
      const initialKey = `${initialOption.fiscalYear}::${initialOption.calendarId}`;
      if (key === initialKey) {
        return;
      }
    }

    let active = true;

    const load = async () => {
      try {
        setLoadState("loading");
        setErrorMessage(null);
        const nextTerms = await loadTerms(selectedOption);
        if (!active) {
          return;
        }
        setTerms(nextTerms);
        setSelectedTermIds((prev) =>
          prev.filter((id) => nextTerms.some((term) => term.id === id)),
        );
        setLoadState("success");
      } catch (error) {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "学期情報の取得に失敗しました。";
        setTerms([]);
        setSelectedTermIds([]);
        setLoadState("error");
        setErrorMessage(message);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [
    initialOption,
    isOpen,
    loadTerms,
    selectedOption,
    terms.length,
  ]);

  const termNameMap = useMemo(() => {
    return terms.reduce<Map<string, string>>((map, term) => {
      map.set(term.id, term.name);
      return map;
    }, new Map());
  }, [terms]);

  const handleToggleTerm = (termId: string) => {
    setSelectedTermIds((prev) => {
      const exists = prev.includes(termId);
      if (exists) {
        return prev.filter((id) => id !== termId);
      }
      return [...prev, termId];
    });
  };

  const handleApply = () => {
    onApply({
      option: selectedOption,
      termIds: selectedTermIds,
      specialOption: selectedSpecialOption,
    });
  };

  if (!isOpen) {
    return null;
  }

  const hasCalendarOptions = calendarOptions.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex h-full w-full items-center justify-center bg-black/50 px-4 py-6">
      <div className="flex h-full max-h-[560px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex h-16 w-full items-center justify-between border-b border-neutral-200 px-5">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">学期設定</h2>
            <p className="text-xs text-neutral-500">年度、学期、特殊日程を選択してください。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
          >
            閉じる
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-50 px-5 py-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">年度</span>
              <select
                value={selectedOption ? `${selectedOption.fiscalYear}::${selectedOption.calendarId}` : ""}
                onChange={(event) => {
                  const value = event.target.value;
                  const next = calendarOptions.find(
                    (option) => `${option.fiscalYear}::${option.calendarId}` === value,
                  );
                  setSelectedOption(next ?? null);
                }}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {hasCalendarOptions ? null : <option value="">年度設定なし</option>}
                {calendarOptions.map((option) => (
                  <option key={`${option.fiscalYear}-${option.calendarId}`} value={`${option.fiscalYear}::${option.calendarId}`}>
                    {option.fiscalYear}年度 ({option.calendarId})
                  </option>
                ))}
              </select>
              {!hasCalendarOptions ? (
                <p className="text-xs text-red-500">年度設定がありません。ユーザ設定から追加してください。</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-700">学期</span>
                <span className="text-xs text-neutral-500">複数選択できます</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {terms.map((term) => {
                  const isSelected = selectedTermIds.includes(term.id);
                  return (
                    <button
                      key={term.id}
                      type="button"
                      onClick={() => handleToggleTerm(term.id)}
                      className={`flex h-12 w-full items-center justify-between rounded-lg border px-3 text-sm font-medium transition ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                      }`}
                    >
                      <span>{term.name}</span>
                      <span className="text-xs text-neutral-500">
                        {isSelected ? "選択中" : "未選択"}
                      </span>
                    </button>
                  );
                })}
                {terms.length === 0 && loadState !== "loading" ? (
                  <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-xs text-neutral-500">
                    学期情報がありません。
                  </p>
                ) : null}
              </div>
              {loadState === "loading" ? (
                <p className="text-xs text-neutral-500">学期情報を読み込み中です...</p>
              ) : null}
              {loadState === "error" && errorMessage ? (
                <p className="text-xs text-red-600">{errorMessage}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">特殊日程</span>
              <select
                value={selectedSpecialOption}
                onChange={(event) =>
                  setSelectedSpecialOption(event.target.value as SpecialScheduleOption)
                }
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {Object.entries(SPECIAL_SCHEDULE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {selectedTermIds.length > 0 ? (
              <div className="rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-600">
                選択中: {selectedTermIds.map((termId) => termNameMap.get(termId) ?? termId).join("、")}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-200 bg-white p-3 text-xs text-neutral-500">
                学期を選択してください。
              </div>
            )}
          </div>
        </div>
        <footer className="flex h-16 w-full items-center justify-end gap-3 border-t border-neutral-200 bg-white px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!selectedOption || loadState === "loading"}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            適用する
          </button>
        </footer>
      </div>
    </div>
  );
}

export default TermSettingsDialog;
