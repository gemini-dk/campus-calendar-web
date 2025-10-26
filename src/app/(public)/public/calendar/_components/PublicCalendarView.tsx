"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getCalendarDisplayInfo,
  type CalendarDisplayInfo,
} from "@/lib/data/service/calendarDisplay.service";

const WEEKDAY_HEADERS = [
  { label: "Sun", shortLabel: "日", color: "#f87171" },
  { label: "Mon", shortLabel: "月", color: "#fb923c" },
  { label: "Tue", shortLabel: "火", color: "#facc15" },
  { label: "Wed", shortLabel: "水", color: "#4ade80" },
  { label: "Thu", shortLabel: "木", color: "#38bdf8" },
  { label: "Fri", shortLabel: "金", color: "#60a5fa" },
  { label: "Sat", shortLabel: "土", color: "#a855f7" },
];

const ACCENT_COLOR_CLASS: Record<string, string> = {
  default: "text-neutral-900",
  holiday: "text-red-500",
  saturday: "text-blue-600",
};

const BACKGROUND_COLOR_MAP: Record<string, string> = {
  none: "var(--color-calendar-default-background)",
  sunday: "var(--color-my-background-dim)",
  holiday: "var(--color-my-background-dim)",
  exam: "var(--color-calendar-exam-background)",
  reserve: "var(--color-my-secondary-container)",
};

const FISCAL_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const CALENDAR_CELL_COUNT = 42;

type CalendarInfoMap = Record<string, CalendarDisplayInfo>;

type MonthOption = {
  month: number;
  label: string;
  date: Date;
};

type MonthConfig = MonthOption & {
  displayYear: number;
  calendarDates: Date[];
  dateIds: string[];
};

type BaseCalendarProps = {
  fiscalYear: string;
  calendarId: string;
  hasSaturdayClasses?: boolean;
};

type SingleModeProps = BaseCalendarProps & {
  initialMonth: number | null;
  displayMode?: "single";
};

type GridModeProps = BaseCalendarProps & {
  displayMode: "grid";
  initialMonth?: number | null;
};

type PublicCalendarViewProps = SingleModeProps | GridModeProps;

type SingleMonthCalendarViewProps = BaseCalendarProps & {
  initialMonth: number | null;
};

type GridCalendarViewProps = BaseCalendarProps;

function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function generateMonthDates(monthDate: Date): Date[] {
  const startDate = startOfMonth(monthDate);
  const startWeekday = startDate.getDay();
  const firstCell = new Date(startDate);
  firstCell.setDate(startDate.getDate() - startWeekday);

  return Array.from({ length: CALENDAR_CELL_COUNT }, (_, index) => {
    const current = new Date(firstCell);
    current.setDate(firstCell.getDate() + index);
    return current;
  });
}

function resolveAccentColorClass(accent: string | null | undefined): string {
  if (!accent) {
    return ACCENT_COLOR_CLASS.default;
  }
  return ACCENT_COLOR_CLASS[accent] ?? ACCENT_COLOR_CLASS.default;
}

function resolveBackgroundColor(color: string | null | undefined): string {
  if (!color) {
    return BACKGROUND_COLOR_MAP.none;
  }
  return BACKGROUND_COLOR_MAP[color] ?? BACKGROUND_COLOR_MAP.none;
}

function extractDayNumber(label: string | null | undefined): string {
  if (!label) {
    return "-";
  }
  const match = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return label;
  }
  return String(Number(match[3]));
}

function resolveInitialMonth(fiscalYear: string, providedMonth: number | null): number {
  if (providedMonth && FISCAL_MONTHS.includes(providedMonth)) {
    return providedMonth;
  }
  const numericYear = Number(fiscalYear);
  if (!Number.isFinite(numericYear)) {
    return FISCAL_MONTHS[0];
  }
  const today = new Date();
  const fiscalStart = new Date(numericYear, 3, 1);
  const fiscalEnd = new Date(numericYear + 1, 2, 31, 23, 59, 59, 999);
  if (today >= fiscalStart && today <= fiscalEnd) {
    const candidate = today.getMonth() + 1;
    if (FISCAL_MONTHS.includes(candidate)) {
      return candidate;
    }
  }
  return FISCAL_MONTHS[0];
}

function SingleMonthCalendarView({
  fiscalYear,
  calendarId,
  initialMonth,
  hasSaturdayClasses = true,
}: SingleMonthCalendarViewProps) {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(() => resolveInitialMonth(fiscalYear, initialMonth));
  const [infoMap, setInfoMap] = useState<CalendarInfoMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMonth(resolveInitialMonth(fiscalYear, initialMonth));
  }, [fiscalYear, initialMonth]);

  const monthOptions = useMemo<MonthOption[]>(() => {
    const yearNumber = Number(fiscalYear);
    return FISCAL_MONTHS.map((month) => {
      const adjustedYear = month >= 4 ? yearNumber : yearNumber + 1;
      const baseYear = Number.isFinite(adjustedYear) ? adjustedYear : new Date().getFullYear();
      return {
        month,
        label: `${month}月`,
        date: new Date(baseYear, month - 1, 1),
      };
    });
  }, [fiscalYear]);

  const activeMonthDate = useMemo(() => {
    const option = monthOptions.find((item) => item.month === selectedMonth);
    return option?.date ?? startOfMonth(new Date());
  }, [monthOptions, selectedMonth]);

  const calendarDates = useMemo(() => generateMonthDates(activeMonthDate), [activeMonthDate]);
  const dateIds = useMemo(() => calendarDates.map((date) => formatDateId(date)), [calendarDates]);
  const todayId = useMemo(() => formatDateId(new Date()), []);

  const isConfigReady = fiscalYear.trim().length > 0 && calendarId.trim().length > 0;

  useEffect(() => {
    if (!isConfigReady) {
      setInfoMap({});
      setError("年度またはカレンダーIDが指定されていません。");
      setLoading(false);
      return;
    }
    setError(null);
    let canceled = false;
    async function loadMonthInfo() {
      setLoading(true);
      try {
        const results = await Promise.all(
          dateIds.map(async (dateId) => {
            const info = await getCalendarDisplayInfo(fiscalYear, calendarId, dateId, { hasSaturdayClasses });
            return { dateId, info };
          }),
        );
        if (canceled) {
          return;
        }
        const nextMap: CalendarInfoMap = {};
        for (const { dateId, info } of results) {
          nextMap[dateId] = info;
        }
        setInfoMap(nextMap);
      } catch (cause) {
        if (canceled) {
          return;
        }
        console.error(cause);
        setError("学事予定の読み込みに失敗しました。しばらくしてから再度お試しください。");
        setInfoMap({});
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }
    loadMonthInfo();
    return () => {
      canceled = true;
    };
  }, [calendarId, dateIds, fiscalYear, hasSaturdayClasses, isConfigReady]);

  const handleChangeMonth = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = Number(event.target.value);
      if (!FISCAL_MONTHS.includes(value)) {
        return;
      }
      setSelectedMonth(value);
      const search = new URLSearchParams();
      search.set("year", fiscalYear);
      search.set("month", String(value));
      router.replace(`/public/calendar/${encodeURIComponent(calendarId)}?${search.toString()}`);
    },
    [calendarId, fiscalYear, router],
  );

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-neutral-100 px-4 py-8">
      <div className="flex w-full max-w-5xl flex-1 flex-col rounded-lg bg-white px-5 py-6 shadow">
        <header className="flex h-16 w-full items-end justify-end">
          <div className="flex h-full w-full max-w-xs flex-col justify-end">
            <label className="flex h-full w-full flex-col gap-1 text-sm text-neutral-700" htmlFor="public-calendar-month">
              月を選択
              <select
                id="public-calendar-month"
                value={selectedMonth}
                onChange={handleChangeMonth}
                className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {monthOptions.map((option) => (
                  <option key={option.month} value={option.month}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="mt-4 flex h-full w-full flex-1 flex-col">
          <div className="grid h-10 w-full grid-cols-7 border border-neutral-200 bg-neutral-50 text-[13px] font-semibold text-neutral-700">
            {WEEKDAY_HEADERS.map((weekday) => (
              <div
                key={weekday.label}
                className="flex h-full w-full items-center justify-center border-r border-neutral-200 last:border-r-0"
              >
                <span>{weekday.shortLabel}</span>
              </div>
            ))}
          </div>

          <div className="flex h-full min-h-[560px] w-full flex-1 flex-col">
            <div className="grid h-full w-full flex-1 grid-cols-7 grid-rows-6 border border-t-0 border-neutral-200">
              {calendarDates.map((date, index) => {
                const dateId = dateIds[index];
                const info = infoMap[dateId];
                const general = info?.calendar;
                const academic = info?.academic;
                const day = info?.day ?? null;

                const isCurrentMonth =
                  date.getFullYear() === activeMonthDate.getFullYear() &&
                  date.getMonth() === activeMonthDate.getMonth();
                const isToday = dateId === todayId;
                const showRightBorder = (index + 1) % WEEKDAY_HEADERS.length !== 0;
                const showBottomBorder = index < CALENDAR_CELL_COUNT - WEEKDAY_HEADERS.length;

                if (!isCurrentMonth) {
                  return (
                    <div
                      key={dateId}
                      className="flex h-full min-h-0 w-full flex-col bg-white"
                      style={{
                        borderRightWidth: showRightBorder ? 1 : 0,
                        borderBottomWidth: showBottomBorder ? 1 : 0,
                        borderColor: "rgba(212, 212, 216, 1)",
                        borderStyle: "solid",
                      }}
                    />
                  );
                }

                const hasNotificationAlert =
                  Array.isArray(day?.notificationReasons) &&
                  day.notificationReasons.some((reason) => reason === "1" || reason === "2" || reason === "3");

                const dateNumber = extractDayNumber(general?.dateLabel ?? dateId);
                const dateColorClass = resolveAccentColorClass(general?.dateTextColor);
                const backgroundColor = resolveBackgroundColor(academic?.backgroundColor);
                const cellBackgroundColor = isToday
                  ? "var(--color-calendar-today-background)"
                  : backgroundColor;

                const isClassDay = day?.type === "授業日";
                const classOrder = academic?.classOrder;
                const classWeekday = academic?.weekdayNumber;
                const weekdayColor =
                  typeof classWeekday === "number"
                    ? WEEKDAY_HEADERS[classWeekday]?.color ?? "#2563eb"
                    : "#2563eb";

                const rawTermName = typeof info?.term?.name === "string" ? info.term.name.trim() : "";
                const fallbackTermName =
                  typeof day?.termName === "string" && day.termName ? day.termName.trim() : "";
                const publicLabel = rawTermName
                  ? rawTermName
                  : fallbackTermName
                    ? fallbackTermName
                    : academic?.label ?? "予定なし";

                return (
                  <div
                    key={dateId}
                    className={`flex h-full min-h-0 w-full flex-col overflow-hidden px-1.5 py-1.5 text-left text-[11px] leading-tight ${
                      isToday
                        ? ""
                        : "hover:bg-neutral-200/60"
                    }`}
                    style={{
                      backgroundColor: cellBackgroundColor,
                      borderRightWidth: showRightBorder ? 1 : 0,
                      borderBottomWidth: showBottomBorder ? 1 : 0,
                      borderColor: "rgba(212, 212, 216, 1)",
                      borderStyle: "solid",
                      boxShadow: hasNotificationAlert ? "inset 0 0 0 2px #1e3a8a" : undefined,
                    }}
                  >
                    <div className="flex flex-shrink-0 items-start justify-between">
                      <span className={`text-[13px] font-semibold ${dateColorClass}`}>{dateNumber}</span>
                      {isClassDay && typeof classOrder === "number" ? (
                        <span
                          className="flex h-[18px] min-w-[18px] items-center justify-center text-[11px] font-bold text-white"
                          style={{ backgroundColor: weekdayColor }}
                        >
                          {classOrder}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 flex min-h-0 flex-1 flex-col items-center overflow-hidden">
                      <span className="block w-full min-h-[18px] truncate text-center text-[11px] text-neutral-800">
                        {publicLabel}
                      </span>
                      {academic?.subLabel ? (
                        <span className="mt-[2px] block w-full min-h-[16px] truncate text-center text-[11px] font-bold text-neutral-900">
                          {academic.subLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {loading ? (
              <div className="flex h-12 w-full items-center justify-center text-sm text-neutral-600">読み込み中...</div>
            ) : null}

            {error ? (
              <div className="flex h-12 w-full items-center justify-center text-sm text-red-600">{error}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function GridCalendarView({
  fiscalYear,
  calendarId,
  hasSaturdayClasses = true,
}: GridCalendarViewProps) {
  const [infoMap, setInfoMap] = useState<CalendarInfoMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthOptions = useMemo<MonthOption[]>(() => {
    const yearNumber = Number(fiscalYear);
    return FISCAL_MONTHS.map((month) => {
      const adjustedYear = month >= 4 ? yearNumber : yearNumber + 1;
      const baseYear = Number.isFinite(adjustedYear) ? adjustedYear : new Date().getFullYear();
      return {
        month,
        label: `${month}月`,
        date: new Date(baseYear, month - 1, 1),
      };
    });
  }, [fiscalYear]);

  const monthConfigs = useMemo<MonthConfig[]>(() => {
    return monthOptions.map((option) => {
      const calendarDates = generateMonthDates(option.date);
      const dateIds = calendarDates.map((date) => formatDateId(date));
      return {
        ...option,
        displayYear: option.date.getFullYear(),
        calendarDates,
        dateIds,
      };
    });
  }, [monthOptions]);

  const uniqueDateIds = useMemo(() => {
    const unique = new Set<string>();
    for (const config of monthConfigs) {
      for (const dateId of config.dateIds) {
        unique.add(dateId);
      }
    }
    return Array.from(unique);
  }, [monthConfigs]);

  const todayId = useMemo(() => formatDateId(new Date()), []);

  const isConfigReady = fiscalYear.trim().length > 0 && calendarId.trim().length > 0;

  useEffect(() => {
    if (!isConfigReady) {
      setInfoMap({});
      setError("年度またはカレンダーIDが指定されていません。");
      setLoading(false);
      return;
    }
    setError(null);
    let canceled = false;

    async function loadAllMonths() {
      setLoading(true);
      try {
        const results = await Promise.all(
          uniqueDateIds.map(async (dateId) => {
            const info = await getCalendarDisplayInfo(fiscalYear, calendarId, dateId, { hasSaturdayClasses });
            return { dateId, info };
          }),
        );
        if (canceled) {
          return;
        }
        const nextMap: CalendarInfoMap = {};
        for (const { dateId, info } of results) {
          nextMap[dateId] = info;
        }
        setInfoMap(nextMap);
      } catch (cause) {
        if (canceled) {
          return;
        }
        console.error(cause);
        setError("学事予定の読み込みに失敗しました。しばらくしてから再度お試しください。");
        setInfoMap({});
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    loadAllMonths();
    return () => {
      canceled = true;
    };
  }, [calendarId, fiscalYear, hasSaturdayClasses, isConfigReady, uniqueDateIds]);

  return (
    <div className="flex w-full flex-col gap-6 bg-neutral-100">
      <div className="flex w-full flex-col rounded-lg bg-white px-5 py-6 shadow">
        {loading ? (
          <div className="mt-4 flex h-10 w-full items-center justify-center rounded border border-dashed border-neutral-200 text-sm text-neutral-600">
            読み込み中...
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex h-10 w-full items-center justify-center rounded border border-red-200 bg-red-50 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid w-full grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {monthConfigs.map((config) => (
            <section
              key={`${config.displayYear}-${config.month}`}
              className="flex h-full min-h-[340px] w-full max-w-[320px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm"
            >
              <div className="flex h-12 w-full items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-neutral-500">{`${config.displayYear}年`}</span>
                  <span className="text-base font-bold text-neutral-900">{config.label}</span>
                </div>
              </div>
              <div className="flex h-full w-full flex-1 flex-col">
                <div className="grid h-8 w-full grid-cols-7 border border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-700">
                  {WEEKDAY_HEADERS.map((weekday) => (
                    <div
                      key={`${config.month}-${weekday.label}`}
                      className="flex h-full w-full items-center justify-center border-r border-neutral-200 last:border-r-0"
                    >
                      <span>{weekday.shortLabel}</span>
                    </div>
                  ))}
                </div>
                <div className="grid flex-1 grid-cols-7 grid-rows-6 border border-t-0 border-neutral-200">
                  {config.calendarDates.map((date, index) => {
                    const dateId = config.dateIds[index];
                    const info = infoMap[dateId];
                    const general = info?.calendar;
                    const academic = info?.academic;
                    const day = info?.day ?? null;

                    const isCurrentMonth =
                      date.getFullYear() === config.date.getFullYear() &&
                      date.getMonth() === config.date.getMonth();
                    const isToday = dateId === todayId;
                    const showRightBorder = (index + 1) % WEEKDAY_HEADERS.length !== 0;
                    const showBottomBorder = index < CALENDAR_CELL_COUNT - WEEKDAY_HEADERS.length;

                    if (!isCurrentMonth) {
                      return (
                        <div
                          key={`${config.displayYear}-${config.month}-${dateId}`}
                          className="flex h-full min-h-[60px] w-full flex-col bg-white"
                          style={{
                            borderRightWidth: showRightBorder ? 1 : 0,
                            borderBottomWidth: showBottomBorder ? 1 : 0,
                            borderColor: "rgba(212, 212, 216, 1)",
                            borderStyle: "solid",
                          }}
                        />
                      );
                    }

                    const hasNotificationAlert =
                      Array.isArray(day?.notificationReasons) &&
                      day.notificationReasons.some((reason) => reason === "1" || reason === "2" || reason === "3");

                    const dateNumber = extractDayNumber(general?.dateLabel ?? dateId);
                    const dateColorClass = resolveAccentColorClass(general?.dateTextColor);
                    const backgroundColor = resolveBackgroundColor(academic?.backgroundColor);
                    const cellBackgroundColor = isToday
                      ? "var(--color-calendar-today-background)"
                      : backgroundColor;

                    const isClassDay = day?.type === "授業日";
                    const classOrder = academic?.classOrder;
                    const classWeekday = academic?.weekdayNumber;
                    const weekdayColor =
                      typeof classWeekday === "number"
                        ? WEEKDAY_HEADERS[classWeekday]?.color ?? "#2563eb"
                        : "#2563eb";

                    const rawTermName = typeof info?.term?.name === "string" ? info.term.name.trim() : "";
                    const fallbackTermName =
                      typeof day?.termName === "string" && day.termName ? day.termName.trim() : "";
                    const publicLabel = rawTermName
                      ? rawTermName
                      : fallbackTermName
                        ? fallbackTermName
                        : academic?.label ?? "予定なし";

                    return (
                      <div
                        key={`${config.displayYear}-${config.month}-${dateId}`}
                        className={`flex h-full min-h-[56px] w-full flex-col overflow-hidden px-1.5 py-1 text-left text-[10px] leading-tight ${
                          isToday ? "" : "hover:bg-neutral-200/60"
                        }`}
                        style={{
                          backgroundColor: cellBackgroundColor,
                          borderRightWidth: showRightBorder ? 1 : 0,
                          borderBottomWidth: showBottomBorder ? 1 : 0,
                          borderColor: "rgba(212, 212, 216, 1)",
                          borderStyle: "solid",
                          boxShadow: hasNotificationAlert ? "inset 0 0 0 2px #1e3a8a" : undefined,
                        }}
                      >
                        <div className="flex flex-shrink-0 items-start justify-between">
                          <span className={`text-xs font-semibold ${dateColorClass}`}>{dateNumber}</span>
                          {isClassDay && typeof classOrder === "number" ? (
                            <span
                              className="flex h-[16px] min-w-[16px] items-center justify-center text-[10px] font-bold text-white"
                              style={{ backgroundColor: weekdayColor }}
                            >
                              {classOrder}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex min-h-0 flex-1 flex-col items-center overflow-hidden">
                          <span className="block w-full min-h-[16px] truncate text-center text-[10px] text-neutral-800">
                            {publicLabel}
                          </span>
                          {academic?.subLabel ? (
                            <span className="mt-[2px] block w-full min-h-[14px] truncate text-center text-[10px] font-bold text-neutral-900">
                              {academic.subLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PublicCalendarView(props: PublicCalendarViewProps) {
  if (props.displayMode === "grid") {
    const { calendarId, fiscalYear, hasSaturdayClasses = true } = props;
    return (
      <GridCalendarView
        fiscalYear={fiscalYear}
        calendarId={calendarId}
        hasSaturdayClasses={hasSaturdayClasses}
      />
    );
  }

  const { calendarId, fiscalYear, initialMonth, hasSaturdayClasses = true } = props;
  return (
    <SingleMonthCalendarView
      fiscalYear={fiscalYear}
      calendarId={calendarId}
      initialMonth={initialMonth}
      hasSaturdayClasses={hasSaturdayClasses}
    />
  );
}
