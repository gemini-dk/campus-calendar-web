'use client';

import type { PointerEvent as ReactPointerEvent, TransitionEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getCalendarDisplayInfo,
  type CalendarDisplayInfo,
} from '@/lib/data/service/calendarDisplay.service';
import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import UserHamburgerMenu from '../components/UserHamburgerMenu';

const CALENDAR_SETTINGS_ERROR_MESSAGE =
  '学事カレンダー設定が未入力です。設定タブで保存してください。';

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
  const { settings, initialized } = useUserSettings();
  const fiscalYear = settings.calendar.fiscalYear.trim();
  const calendarId = settings.calendar.calendarId.trim();
  const configKey = useMemo(() => `${fiscalYear}::${calendarId}`, [calendarId, fiscalYear]);
  const configKeyRef = useRef(configKey);

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

  useEffect(() => {
    if (configKeyRef.current === configKey) {
      return;
    }
    configKeyRef.current = configKey;
    setInfoMap({});
    setMonthStates({});
    monthStatesRef.current = {};
  }, [configKey]);

  const requestMonthData = useCallback(
    (monthDate: Date, options?: { force?: boolean }) => {
      if (!initialized) {
        return undefined;
      }

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

      if (!fiscalYear || !calendarId) {
        if (
          existing &&
          existing.errorMessage === CALENDAR_SETTINGS_ERROR_MESSAGE &&
          !existing.loading &&
          !existing.loaded
        ) {
          return undefined;
        }

        const state: MonthState = {
          dates,
          dateIds,
          loading: false,
          loaded: false,
          errorMessage: CALENDAR_SETTINGS_ERROR_MESSAGE,
        };

        setMonthStates((prev) => {
          const next = { ...prev, [monthKey]: state };
          monthStatesRef.current = next;
          return next;
        });

        return undefined;
      }

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
      const requestKey = configKeyRef.current;

      Promise.all(
        dateIds.map(async (dateId) => {
          const info = await getCalendarDisplayInfo(fiscalYear, calendarId, dateId);
          return { dateId, info } as const;
        }),
      )
        .then((entries) => {
          if (cancelled || configKeyRef.current !== requestKey) {
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
          if (cancelled || configKeyRef.current !== requestKey) {
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
    [calendarId, configKey, fiscalYear, initialized],
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

  const releasePointerCapture = useCallback((pointerId: number | null) => {
    if (pointerId == null) {
      return;
    }
    const element = viewportRef.current;
    if (!element) {
      return;
    }
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // no-op: element may already be detached or capture released
    }
  }, []);

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

  const finishDrag = useCallback(
    (options?: { cancelled?: boolean }) => {
      const delta = dragDeltaRef.current;
      const threshold = containerWidth * 0.25;

      setIsDragging(false);
      setPendingDirection(null);

      if (!options?.cancelled && containerWidth > 0 && Math.abs(delta) > threshold) {
        const direction: 'prev' | 'next' = delta > 0 ? 'prev' : 'next';
        startTransition(direction);
      } else {
        if (containerWidth > 0) {
          setIsAnimating(true);
        } else {
          setIsAnimating(false);
        }
        setTranslate(0);
      }

      resetDragState();
    },
    [containerWidth, resetDragState, startTransition],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) {
        return;
      }

      releasePointerCapture(event.pointerId);
      finishDrag();
    },
    [finishDrag, isDragging, releasePointerCapture],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) {
        return;
      }
      releasePointerCapture(event.pointerId);
      finishDrag({ cancelled: true });
    },
    [finishDrag, isDragging, releasePointerCapture],
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) {
        return;
      }
      releasePointerCapture(event.pointerId);
      finishDrag();
    };
    const handleWindowPointerCancel = (event: PointerEvent) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) {
        return;
      }
      releasePointerCapture(event.pointerId);
      finishDrag({ cancelled: true });
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [finishDrag, isDragging, releasePointerCapture]);

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

  const isCalendarConfigured = Boolean(fiscalYear && calendarId);
  const calendarAvailable = initialized && isCalendarConfigured;

  return (
    <div className="flex h-full w-full flex-col bg-neutral-50">
      <header className="flex h-[50px] w-full items-center border-b border-neutral-200 bg-white px-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-lg font-semibold text-neutral-900">{monthLabel}</div>
          <UserHamburgerMenu buttonAriaLabel="ユーザメニューを開く" />
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {calendarAvailable ? (
          <div className="flex h-full w-full flex-col">
            <div className="grid w-full grid-cols-7 text-center text-[11px] font-semibold text-neutral-600">
              {WEEKDAY_HEADERS.map((weekday) => (
                <div key={weekday.label} className="flex flex-col items-center justify-center">
                  <div className="h-[3px] w-full" style={{ backgroundColor: weekday.color }} />
                  <span className="pt-1">{weekday.label}</span>
                </div>
              ))}
            </div>
            <div
              ref={viewportRef}
              className="flex w-full flex-1 select-none overflow-hidden touch-pan-y"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerCancel}
            >
              <div className="flex h-full" style={trackStyle} onTransitionEnd={handleTransitionEnd}>
                {months.map((monthDate) => {
                  const monthKey = getMonthKey(monthDate);
                  const state = monthStates[monthKey];
                  const style = containerWidth
                    ? { width: containerWidth }
                    : { width: '100%' };

                  return (
                    <div key={monthKey} className="flex h-full w-full flex-shrink-0" style={style}>
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
        ) : (
          <div className="flex h-full items-center justify-center bg-neutral-50 px-6 text-center text-sm text-neutral-600">
            {!initialized
              ? '学事カレンダー設定を読み込み中です...'
              : CALENDAR_SETTINGS_ERROR_MESSAGE}
          </div>
        )}
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
  const isCalendarSettingsError = errorMessage === CALENDAR_SETTINGS_ERROR_MESSAGE;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="grid w-full flex-1 grid-cols-7 grid-rows-6 border border-neutral-200">
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
              className={`flex min-h-0 flex-col overflow-hidden text-[11px] leading-tight ${
                isCurrentMonth ? '' : 'opacity-50'
              } ${isToday ? 'outline outline-2 outline-blue-400' : ''}`}
              style={{
                backgroundColor,
                borderRightWidth: showRightBorder ? 1 : 0,
                borderBottomWidth: showBottomBorder ? 1 : 0,
                borderColor: 'rgba(212, 212, 216, 1)',
                borderStyle: 'solid',
              }}
            >
              <div className="flex flex-shrink-0 items-start justify-between">
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

              <div className="mt-1 flex flex-1 min-h-0 flex-col overflow-hidden gap-[2px]">
                <span className="block w-full min-h-[24px] line-clamp-2 text-[11px] font-semibold text-neutral-800">
                  {academic?.label ?? '予定なし'}
                </span>
                <span className="block w-full min-h-[12px] line-clamp-1 text-[10px] text-neutral-600">
                  {academic?.subLabel ?? ''}
                </span>
                <span className="block w-full min-h-[12px] line-clamp-1 text-[10px] text-neutral-600">
                  {day?.description ?? ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-2 text-sm text-neutral-600">読み込み中...</div>
      ) : null}

      {errorMessage ? (
        <div className="flex flex-col items-center gap-2 py-2 text-sm text-red-600">
          <span>{errorMessage}</span>
          {isCalendarSettingsError ? null : (
            <button
              type="button"
              onClick={() => onRetry(monthDate)}
              className="border border-red-200 px-3 py-1 text-xs font-medium text-red-600"
            >
              再読み込み
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
