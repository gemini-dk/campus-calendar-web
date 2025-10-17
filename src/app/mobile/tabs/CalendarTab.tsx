'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getCalendarDisplayInfo,
  type CalendarDisplayInfo,
} from '@/lib/data/service/calendarDisplay.service';

const DEFAULT_FISCAL_YEAR = '2025';
const DEFAULT_CALENDAR_ID = 'jd70dxbqvevcf5kj43cbaf4rjn7rs93e';

const WEEKDAY_HEADERS = [
  { label: 'Sun', shortLabel: '日', color: '#f87171' },
  { label: 'Mon', shortLabel: '月', color: '#fb923c' },
  { label: 'Tue', shortLabel: '火', color: '#facc15' },
  { label: 'Wed', shortLabel: '水', color: '#4ade80' },
  { label: 'Thu', shortLabel: '木', color: '#38bdf8' },
  { label: 'Fri', shortLabel: '金', color: '#60a5fa' },
  { label: 'Sat', shortLabel: '土', color: '#a855f7' },
];

const ACCENT_COLOR_CLASS: Record<string, string> = {
  default: 'text-neutral-900',
  holiday: 'text-red-500',
  saturday: 'text-blue-600',
};

const BACKGROUND_COLOR_MAP: Record<string, string> = {
  none: '#f5f5f4',
  sunday: '#ffe5e5',
  holiday: '#fff2d6',
  exam: '#ebe5ff',
  reserve: '#e1f4ff',
};

type CalendarInfoMap = Record<string, CalendarDisplayInfo>;

function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractDayNumber(label: string | null | undefined): string {
  if (!label) {
    return '-';
  }
  const match = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return label;
  }
  return String(Number(match[3]));
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

export default function CalendarTab() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [infoMap, setInfoMap] = useState<CalendarInfoMap>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dates = useMemo(() => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const startWeekday = startOfMonth.getDay();
    const firstCellDate = new Date(startOfMonth);
    firstCellDate.setDate(startOfMonth.getDate() - startWeekday);

    return Array.from({ length: 42 }, (_, index) => {
      const cellDate = new Date(firstCellDate);
      cellDate.setDate(firstCellDate.getDate() + index);
      return cellDate;
    });
  }, [currentMonth]);

  const dateIds = useMemo(() => dates.map((date) => formatDateId(date)), [dates]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage(null);

    Promise.all(
      dateIds.map(async (dateId) => {
        const info = await getCalendarDisplayInfo(
          DEFAULT_FISCAL_YEAR,
          DEFAULT_CALENDAR_ID,
          dateId,
        );
        return { dateId, info } as const;
      }),
    )
      .then((entries) => {
        if (!active) {
          return;
        }
        const nextMap: CalendarInfoMap = {};
        for (const entry of entries) {
          nextMap[entry.dateId] = entry.info;
        }
        setInfoMap(nextMap);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setErrorMessage('学事情報の取得に失敗しました。');
        setInfoMap({});
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [dateIds]);

  const todayId = useMemo(() => formatDateId(new Date()), []);
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }),
    [],
  );
  const monthLabel = monthFormatter.format(currentMonth);

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() - 1);
      return new Date(next.getFullYear(), next.getMonth(), 1);
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + 1);
      return new Date(next.getFullYear(), next.getMonth(), 1);
    });
  }, []);

  return (
    <div className="flex min-h-full flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700 transition hover:bg-neutral-200"
          >
            前月
          </button>
          <div className="text-lg font-semibold text-neutral-900">{monthLabel}</div>
          <button
            type="button"
            onClick={handleNextMonth}
            className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700 transition hover:bg-neutral-200"
          >
            翌月
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-neutral-600">
          {WEEKDAY_HEADERS.map((weekday) => (
            <div key={weekday.label} className="flex flex-col items-center gap-2">
              <div
                className="h-1 w-full rounded-full"
                style={{ backgroundColor: weekday.color }}
              />
              <span>{weekday.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-7 gap-3">
          {dates.map((date, index) => {
            const dateId = dateIds[index];
            const info = infoMap[dateId];
            const general = info?.calendar;
            const academic = info?.academic;
            const day = info?.day ?? null;

            const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
            const isToday = dateId === todayId;

            const dateNumber = extractDayNumber(general?.dateLabel ?? dateId);
            const dateColorClass = resolveAccentColorClass(general?.dateTextColor);
            const backgroundColor = resolveBackgroundColor(academic?.backgroundColor);

            const isClassDay = day?.type === '授業日';
            const classOrder = academic?.classOrder;
            const classWeekday = academic?.weekdayNumber;
            const weekdayColor =
              typeof classWeekday === 'number'
                ? WEEKDAY_HEADERS[classWeekday]?.color ?? '#2563eb'
                : '#2563eb';

            return (
              <div
                key={dateId}
                className={`flex min-h-24 flex-col rounded-xl border border-neutral-200 p-3 transition ${
                  isToday ? 'ring-2 ring-blue-400' : ''
                } ${isCurrentMonth ? '' : 'opacity-50'}`}
                style={{ backgroundColor }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-sm font-semibold ${dateColorClass}`}>{dateNumber}</span>
                  {isClassDay && typeof classOrder === 'number' ? (
                    <span
                      className="flex min-w-[28px] items-center justify-center rounded-full px-2 text-xs font-bold text-white"
                      style={{ backgroundColor: weekdayColor }}
                    >
                      {classOrder}
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  <span className="text-xs font-semibold text-neutral-800">
                    {academic?.label ?? '予定なし'}
                  </span>
                  {academic?.subLabel ? (
                    <span className="text-[11px] text-neutral-600">{academic.subLabel}</span>
                  ) : null}
                  {day?.description ? (
                    <span className="text-[11px] text-neutral-600">{day.description}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {loading ? (
          <div className="mt-6 text-center text-sm text-neutral-600">読み込み中...</div>
        ) : null}
        {errorMessage ? (
          <div className="mt-6 text-center text-sm text-red-600">{errorMessage}</div>
        ) : null}
      </div>
    </div>
  );
}
