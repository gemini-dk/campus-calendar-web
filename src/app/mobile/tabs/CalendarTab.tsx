'use client';

import type { PointerEvent as ReactPointerEvent, TransitionEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const CALENDAR_CELL_COUNT = 42;

type CalendarInfoMap = Record<string, CalendarDisplayInfo>;

type MonthState = {
  dates: Date[];
  dateIds: string[];
  loading: boolean;
  loaded: boolean;
  errorMessage: string | null;
};

type MonthStateMap = Record<string, MonthState>;

function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return startOfMonth(next);
}

function generateMonthDates(monthDate: Date): Date[] {
  const start = startOfMonth(monthDate);
  const startWeekday = start.getDay();
  const firstCellDate = new Date(start);
  firstCellDate.setDate(start.getDate() - startWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(firstCellDate);
    cellDate.setDate(firstCellDate.getDate() + index);
    return cellDate;
  });
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
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return startOfMonth(now);
  });
  const [infoMap, setInfoMap] = useState<CalendarInfoMap>({});
  const [monthStates, setMonthStates] = useState<MonthStateMap>({});
  const monthStatesRef = useRef<MonthStateMap>({});

  const [containerWidth, setContainerWidth] = useState(0);
  const [translate, setTranslate] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDirection, setPendingDirection] = useState<'prev' | 'next' | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef(0);
  const dragDeltaRef = useRef(0);

  useEffect(() => {
    monthStatesRef.current = monthStates;
  }, [monthStates]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const requestMonthData = useCallback(
    (monthDate: Date, options?: { force?: boolean }) => {
      const monthKey = getMonthKey(monthDate);
      const existing = monthStatesRef.current[monthKey];

      if (!options?.force) {
        if (existing?.loading || existing?.loaded) {
          return undefined;
        }
      } else if (existing?.loading) {
        return undefined;
      }

      const dates = existing?.dates ?? generateMonthDates(monthDate);
      const dateIds = existing?.dateIds ?? dates.map((date) => formatDateId(date));

      const loadingState: MonthState = {
        dates,
        dateIds,
        loading: true,
        loaded: false,
        errorMessage: null,
      };

      setMonthStates((prev) => {
        const next = { ...prev, [monthKey]: loadingState };
        monthStatesRef.current = next;
        return next;
      });

      let cancelled = false;

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
          if (cancelled) {
            return;
          }
          setInfoMap((prev) => {
            const nextMap: CalendarInfoMap = { ...prev };
            for (const entry of entries) {
              nextMap[entry.dateId] = entry.info;
            }
            return nextMap;
          });
          setMonthStates((prev) => {
            const current = prev[monthKey];
            if (!current) {
              return prev;
            }
            const next: MonthStateMap = {
              ...prev,
              [monthKey]: {
                ...current,
                loading: false,
                loaded: true,
                errorMessage: null,
              },
            };
            monthStatesRef.current = next;
            return next;
          });
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setMonthStates((prev) => {
            const current = prev[monthKey];
            if (!current) {
              return prev;
            }
            const next: MonthStateMap = {
              ...prev,
              [monthKey]: {
                ...current,
                loading: false,
                loaded: false,
                errorMessage: '学事情報の取得に失敗しました。',
              },
            };
            monthStatesRef.current = next;
            return next;
          });
        });

      return () => {
        cancelled = true;
      };
    },
    [],
  );

  useEffect(() => {
    const monthsToFetch = [addMonths(visibleMonth, -1), visibleMonth, addMonths(visibleMonth, 1)];
    const cleanups = monthsToFetch
      .map((month) => requestMonthData(month))
      .filter((cleanup): cleanup is () => void => typeof cleanup === 'function');

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [visibleMonth, requestMonthData]);

  const startTransition = useCallback(
    (direction: 'prev' | 'next') => {
      if (isAnimating) {
        return;
      }

      if (containerWidth === 0) {
        setVisibleMonth((prev) => addMonths(prev, direction === 'next' ? 1 : -1));
        setPendingDirection(null);
        setTranslate(0);
        setIsAnimating(false);
        return;
      }

      dragDeltaRef.current = direction === 'next' ? -containerWidth : containerWidth;
      setPendingDirection(direction);
      setIsAnimating(true);
      setTranslate(direction === 'next' ? -containerWidth : containerWidth);
    },
    [containerWidth, isAnimating],
  );

  const handlePrevMonth = useCallback(() => {
    if (isDragging) {
      return;
    }
    startTransition('prev');
  }, [isDragging, startTransition]);

  const handleNextMonth = useCallback(() => {
    if (isDragging) {
      return;
    }
    startTransition('next');
  }, [isDragging, startTransition]);

  const handleTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (!isAnimating) {
        return;
      }

      if (pendingDirection) {
        setVisibleMonth((prev) => addMonths(prev, pendingDirection === 'next' ? 1 : -1));
      }

      setTranslate(0);
      setIsAnimating(false);
      setPendingDirection(null);
      dragDeltaRef.current = 0;
    },
    [isAnimating, pendingDirection],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      if (isAnimating) {
        return;
      }

      pointerIdRef.current = event.pointerId;
      dragStartRef.current = event.clientX;
      dragDeltaRef.current = 0;
      setIsDragging(true);
      setPendingDirection(null);
      setIsAnimating(false);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isAnimating],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) {
        return;
      }

      const delta = event.clientX - dragStartRef.current;
      const maxOffset = containerWidth;
      const clamped = Math.max(Math.min(delta, maxOffset), -maxOffset);
      dragDeltaRef.current = clamped;
      setTranslate(clamped);
    },
    [containerWidth, isDragging],
  );

  const resetDragState = useCallback(() => {
    pointerIdRef.current = null;
    dragStartRef.current = 0;
    dragDeltaRef.current = 0;
  }, []);

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) {
        return;
      }

      event.currentTarget.releasePointerCapture(event.pointerId);

      const delta = dragDeltaRef.current;
      const threshold = containerWidth * 0.25;

      setIsDragging(false);

      if (containerWidth > 0 && Math.abs(delta) > threshold) {
        const direction: 'prev' | 'next' = delta > 0 ? 'prev' : 'next';
        startTransition(direction);
      } else {
        setPendingDirection(null);
        if (containerWidth > 0) {
          setIsAnimating(true);
        } else {
          setIsAnimating(false);
        }
        setTranslate(0);
      }

      resetDragState();
    },
    [containerWidth, isDragging, resetDragState, startTransition],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) {
        return;
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      setIsDragging(false);
      setPendingDirection(null);
      if (containerWidth > 0) {
        setIsAnimating(true);
      } else {
        setIsAnimating(false);
      }
      setTranslate(0);
      resetDragState();
    },
    [containerWidth, isDragging, resetDragState],
  );

  const todayId = useMemo(() => formatDateId(new Date()), []);
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('ja-JP', { month: 'long', year: 'numeric' }),
    [],
  );
  const monthLabel = monthFormatter.format(visibleMonth);

  const months = useMemo(
    () => [addMonths(visibleMonth, -1), visibleMonth, addMonths(visibleMonth, 1)],
    [visibleMonth],
  );

  const trackStyle = useMemo(() => {
    if (containerWidth === 0) {
      return {
        transform: undefined,
        width: undefined,
        transition: 'none',
      } as const;
    }
    const baseOffset = -containerWidth;
    return {
      width: containerWidth * months.length,
      transform: `translate3d(${baseOffset + translate}px, 0, 0)`,
      transition: isAnimating ? 'transform 0.3s ease' : 'none',
    } as const;
  }, [containerWidth, isAnimating, months.length, translate]);

  const handleRetry = useCallback(
    (monthDate: Date) => {
      requestMonthData(monthDate, { force: true });
    },
    [requestMonthData],
  );

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

        <div
          ref={viewportRef}
          className="mt-4 select-none overflow-hidden touch-pan-y"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerCancel}
        >
          <div className="flex" style={trackStyle} onTransitionEnd={handleTransitionEnd}>
            {months.map((monthDate) => {
              const monthKey = getMonthKey(monthDate);
              const state = monthStates[monthKey];
              const style = containerWidth
                ? { width: containerWidth }
                : { width: '100%' };

              return (
                <div key={monthKey} className="w-full flex-shrink-0 px-1" style={style}>
                  <CalendarMonthSlide
                    monthDate={monthDate}
                    monthState={state}
                    infoMap={infoMap}
                    todayId={todayId}
                    onRetry={handleRetry}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type CalendarMonthSlideProps = {
  monthDate: Date;
  monthState: MonthState | undefined;
  infoMap: CalendarInfoMap;
  todayId: string;
  onRetry: (monthDate: Date) => void;
};

function CalendarMonthSlide({
  monthDate,
  monthState,
  infoMap,
  todayId,
  onRetry,
}: CalendarMonthSlideProps) {
  const rawDates = monthState?.dates ?? generateMonthDates(monthDate);
  const rawDateIds = monthState?.dateIds ?? rawDates.map((date) => formatDateId(date));

  const dates = rawDates.slice(0, CALENDAR_CELL_COUNT);
  const dateIds = rawDateIds.slice(0, dates.length);
  const totalCells = dates.length;
  const isLoading = Boolean(monthState?.loading && !monthState?.loaded);
  const errorMessage = monthState?.errorMessage ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="grid grid-cols-7 grid-rows-6 border border-neutral-200">
        {dates.map((date, index) => {
          const dateId = dateIds[index];
          const info = infoMap[dateId];
          const general = info?.calendar;
          const academic = info?.academic;
          const day = info?.day ?? null;

          const isCurrentMonth =
            date.getFullYear() === monthDate.getFullYear() &&
            date.getMonth() === monthDate.getMonth();
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

          const showRightBorder = (index + 1) % WEEKDAY_HEADERS.length !== 0;
          const showBottomBorder = index < totalCells - WEEKDAY_HEADERS.length;

          return (
            <div
              key={dateId}
              className={`flex flex-col text-[11px] leading-tight ${
                isCurrentMonth ? '' : 'opacity-50'
              } ${isToday ? 'outline outline-2 outline-blue-400' : ''}`}
              style={{
                backgroundColor,
                borderRightWidth: showRightBorder ? 1 : 0,
                borderBottomWidth: showBottomBorder ? 1 : 0,
                borderColor: 'rgba(212, 212, 216, 1)',
              }}
            >
              <div className="flex items-start justify-between">
                <span className={`text-[13px] font-semibold ${dateColorClass}`}>{dateNumber}</span>
                {isClassDay && typeof classOrder === 'number' ? (
                  <span
                    className="flex h-[18px] min-w-[18px] items-center justify-center text-[11px] font-bold text-white"
                    style={{ backgroundColor: weekdayColor }}
                  >
                    {classOrder}
                  </span>
                ) : null}
              </div>

              <div className="mt-1 flex flex-col">
                <span className="text-[11px] font-semibold text-neutral-800">
                  {academic?.label ?? '予定なし'}
                </span>
                {academic?.subLabel ? (
                  <span className="text-[10px] text-neutral-600">{academic.subLabel}</span>
                ) : null}
                {day?.description ? (
                  <span className="text-[10px] text-neutral-600">{day.description}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <div className="mt-6 text-center text-sm text-neutral-600">読み込み中...</div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 flex flex-col items-center gap-2 text-sm text-red-600">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => onRetry(monthDate)}
            className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
          >
            再読み込み
          </button>
        </div>
      ) : null}
    </div>
  );
}
