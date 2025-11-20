"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { ClassType } from "@/app/mobile/utils/classSchedule";
import { PERIOD_COLUMN_WIDTH, WEEKDAY_HEADERS } from "@/app/mobile/tabs/classes/ClassScheduleView";

const CLASS_TYPE_LABELS: Record<ClassType, string> = {
  in_person: "対面",
  online: "オンライン",
  hybrid: "ハイブリッド",
  on_demand: "オンデマンド",
};

const CLASS_TYPE_BADGE_CLASS: Record<ClassType, string> = {
  in_person: "border-blue-200 bg-blue-50 text-blue-700",
  online: "border-purple-200 bg-purple-50 text-purple-700",
  hybrid: "border-sky-200 bg-sky-50 text-sky-700",
  on_demand: "border-amber-200 bg-amber-50 text-amber-700",
};

type ConversionTerm = {
  id: string;
  name: string;
  shortName?: string | null;
};

type ConvertedClass = {
  id: string;
  name: string;
  classType: ClassType;
  termId: string;
  termName?: string | null;
  dayOfWeek: number;
  period: number | "OD";
};

type ConversionResult = {
  terms: ConversionTerm[];
  classes: ConvertedClass[];
  lessonsPerDay?: number | null;
  hasSaturdayClasses?: boolean | null;
};

type ScheduleCellEntry = {
  id: string;
  name: string;
  classType: ClassType;
};

function parseConversionResult(raw: string | null): ConversionResult | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ConversionResult;
  } catch (error) {
    try {
      const decoded = decodeURIComponent(raw);
      return JSON.parse(decoded) as ConversionResult;
    } catch (nestedError) {
      console.error("Failed to parse conversion result", error, nestedError);
      return null;
    }
  }
}

function normalizePeriodKey(period: ConvertedClass["period"]): string {
  if (period === "OD") {
    return "OD";
  }
  if (typeof period === "number" && Number.isFinite(period)) {
    if (period <= 0) {
      return "OD";
    }
    return String(Math.trunc(period));
  }
  return "";
}

export default function BulkImportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-neutral-50 text-sm text-neutral-600">
          変換結果を読み込んでいます…
        </div>
      }
    >
      <BulkImportContent />
    </Suspense>
  );
}

function BulkImportContent() {
  const searchParams = useSearchParams();
  const rawResult = searchParams.get("result") ?? searchParams.get("data");

  const conversionResult = useMemo(() => parseConversionResult(rawResult), [rawResult]);
  const [activeTermId, setActiveTermId] = useState<string | null>(null);

  useEffect(() => {
    if (!conversionResult?.terms?.length) {
      setActiveTermId(null);
      return;
    }
    setActiveTermId((prev) => {
      if (prev && conversionResult.terms.some((term) => term.id === prev)) {
        return prev;
      }
      return conversionResult.terms[0]?.id ?? null;
    });
  }, [conversionResult]);

  const weekdayHeaders = useMemo(() => {
    if (conversionResult?.hasSaturdayClasses) {
      return WEEKDAY_HEADERS.slice(0, 6);
    }
    return WEEKDAY_HEADERS.slice(0, 5);
  }, [conversionResult?.hasSaturdayClasses]);

  const periodLabels = useMemo(() => {
    const lessonsPerDay = Math.max(1, conversionResult?.lessonsPerDay ?? 6);
    const labels = Array.from({ length: lessonsPerDay }, (_, index) => String(index + 1));
    return [...labels, "OD"];
  }, [conversionResult?.lessonsPerDay]);

  const scheduleByTerm = useMemo(() => {
    const result = new Map<string, Map<string, ScheduleCellEntry[]>>();
    if (!conversionResult) {
      return result;
    }

    const availablePeriods = new Set(periodLabels);
    const availableWeekdays = new Set(weekdayHeaders.map((weekday) => weekday.key));

    for (const item of conversionResult.classes ?? []) {
      const termId = item.termId?.trim();
      if (!termId) {
        continue;
      }

      if (!availableWeekdays.has(item.dayOfWeek)) {
        continue;
      }

      const periodKey = normalizePeriodKey(item.period);
      if (!periodKey || !availablePeriods.has(periodKey)) {
        continue;
      }

      const entry: ScheduleCellEntry = {
        id: item.id,
        name: item.name,
        classType: item.classType,
      };

      const termMap = result.get(termId) ?? new Map<string, ScheduleCellEntry[]>();
      const cellKey = `${item.dayOfWeek}-${periodKey}`;
      const existing = termMap.get(cellKey) ?? [];
      existing.push(entry);
      existing.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      termMap.set(cellKey, existing);
      result.set(termId, termMap);
    }

    return result;
  }, [conversionResult, periodLabels, weekdayHeaders]);

  const gridColumnTemplate = useMemo(() => {
    const weekdayCount = Math.max(weekdayHeaders.length, 1);
    return `${PERIOD_COLUMN_WIDTH} repeat(${weekdayCount}, minmax(0, 1fr))`;
  }, [weekdayHeaders.length]);

  const gridRowTemplate = useMemo(() => {
    const rows = ["auto"];
    if (periodLabels.length > 0) {
      rows.push(`repeat(${periodLabels.length}, minmax(0, 1fr))`);
    }
    return rows.join(" ");
  }, [periodLabels.length]);

  const activeSchedule = activeTermId ? scheduleByTerm.get(activeTermId) ?? null : null;
  const selectedTerm =
    activeTermId && conversionResult
      ? conversionResult.terms.find((term) => term.id === activeTermId) ?? null
      : null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-neutral-50">
      <header className="flex h-[60px] w-full items-center border-b border-neutral-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold text-neutral-900">授業インポート結果</div>
          <div className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
            週次プレビュー
          </div>
        </div>
      </header>

      <main className="flex flex-1 min-h-0 flex-col gap-4 p-4">
        <section className="flex w-full flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-neutral-900">学期別スケジュール</h2>
            <p className="text-sm text-neutral-600">
              変換結果の学期候補をタブで切り替え、曜日・時限ごとの配置を確認できます。
            </p>
          </div>

          {conversionResult ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {conversionResult.terms.map((term) => {
                  const isActive = term.id === activeTermId;
                  const label = term.shortName && term.shortName.length > 0 ? term.shortName : term.name;
                  return (
                    <button
                      key={term.id}
                      type="button"
                      onClick={() => setActiveTermId(term.id)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold transition ${
                        isActive
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300"
                      }`}
                      aria-pressed={isActive}
                    >
                      <span className="block max-w-[180px] truncate">{label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <span className="font-semibold">表示中の学期</span>
                    <span className="rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-800">
                      {selectedTerm ? selectedTerm.name : "-"}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {weekdayHeaders.length}曜日 × {periodLabels.length}時限（オンデマンド含む）
                  </div>
                </div>

                <div
                  className="grid h-[540px] w-full overflow-hidden rounded-xl border border-neutral-200 bg-white"
                  style={{ gridTemplateColumns: gridColumnTemplate, gridTemplateRows: gridRowTemplate }}
                >
                  <div className="flex h-12 w-full items-center justify-center border-b border-r border-neutral-200 bg-neutral-100" />

                  {weekdayHeaders.map((weekday, index) => (
                    <div
                      key={`weekday-${weekday.key}`}
                      className="flex h-12 items-center justify-center border-b border-r border-neutral-200 bg-neutral-100 text-sm font-semibold text-neutral-800"
                      style={{ gridColumnStart: index + 2, gridRowStart: 1 }}
                    >
                      {weekday.label}
                    </div>
                  ))}

                  {periodLabels.map((label, rowIndex) => (
                    <div key={`period-${label}`} className="contents">
                      <div
                        className="flex h-full w-full items-center justify-center border-b border-r border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600"
                        style={{ gridColumnStart: 1, gridRowStart: rowIndex + 2 }}
                      >
                        <span className="block w-full truncate">{label}</span>
                      </div>

                      {weekdayHeaders.map((weekday, columnIndex) => {
                        const cellKey = `${weekday.key}-${label}`;
                        const entries = activeSchedule?.get(cellKey) ?? [];

                        if (entries.length === 0) {
                          return (
                            <div
                              key={`cell-${cellKey}`}
                              className="border-b border-r border-neutral-200 bg-white"
                              style={{ gridColumnStart: columnIndex + 2, gridRowStart: rowIndex + 2 }}
                            />
                          );
                        }

                        return (
                          <div
                            key={`cell-${cellKey}`}
                            className="border-b border-r border-neutral-200 bg-white"
                            style={{ gridColumnStart: columnIndex + 2, gridRowStart: rowIndex + 2 }}
                          >
                            <div className="flex h-full w-full flex-col gap-1 overflow-y-auto p-1">
                              {entries.map((entry) => {
                                const badgeClass = CLASS_TYPE_BADGE_CLASS[entry.classType];
                                const typeLabel = CLASS_TYPE_LABELS[entry.classType];
                                return (
                                  <div
                                    key={entry.id}
                                    className="flex min-h-0 flex-col gap-1 rounded-lg border border-blue-200 bg-blue-50 px-1.5 py-1 shadow-sm"
                                  >
                                    <p className="w-full whitespace-pre-wrap break-words text-xs font-semibold leading-tight text-neutral-900">
                                      {entry.name}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      <span
                                        className={`flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10px] font-semibold ${badgeClass}`}
                                      >
                                        {typeLabel}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {!activeSchedule || activeSchedule.size === 0 ? (
                  <p className="text-sm text-neutral-500">この学期に配置された授業が見つかりません。</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-700">
              変換結果JSONが見つかりません。検索パラメータ <code className="text-[13px] font-mono">result</code> または
              <code className="text-[13px] font-mono">data</code> に JSON 文字列を指定してください。
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
