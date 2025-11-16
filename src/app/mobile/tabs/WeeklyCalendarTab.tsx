'use client';

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  TransitionEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVideo } from '@fortawesome/free-solid-svg-icons';

import {
  getCalendarDisplayInfo,
  type CalendarDisplayInfo,
} from '@/lib/data/service/calendarDisplay.service';
import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import UserHamburgerMenu from '../components/UserHamburgerMenu';
import {
  CALENDAR_SETTINGS_ERROR_MESSAGE,
  resolveSessionIcon,
  useCalendarClassEntries,
  type ClassEntriesByDateMap,
} from './calendarShared';
import { useGoogleCalendarEventsForMonth } from '@/lib/google-calendar/hooks/useGoogleCalendarEvents';
import type { GoogleCalendarEventRecord } from '@/lib/google-calendar/types';


const WEEKDAY_ACCENT_CLASS: Record<string, string> = {
  default: 'text-neutral-900',
  holiday: 'text-red-500',
  saturday: 'text-blue-600',
};

const BACKGROUND_COLOR_MAP: Record<string, string> = {
  none: 'var(--color-calendar-default-background)',
  sunday: 'var(--color-my-background-dim)',
  holiday: 'var(--color-my-background-dim)',
  exam: 'var(--color-calendar-exam-background)',
  reserve: 'var(--color-my-secondary-container)',
};

const WEEKDAY_LABEL_JA = ['日', '月', '火', '水', '木', '金', '土'];

const DRAG_DETECTION_THRESHOLD = 6;
const WEEK_COLUMN_COUNT = 2;

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

function startOfWeek(date: Date): Date {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  const weekday = base.getDay();
  const diff = (weekday + 6) % 7;
  base.setDate(base.getDate() - diff);
  return base;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addWeeks(date: Date, amount: number): Date {
  return startOfWeek(addDays(date, amount * 7));
}

function generateWeekDates(weekStart: Date): Date[] {
  const start = startOfWeek(weekStart);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function getWeekKey(weekStart: Date): string {
  return formatDateId(startOfWeek(weekStart));
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

function resolveAccentColor(accent: string | null | undefined): string {
  if (!accent) {
    return WEEKDAY_ACCENT_CLASS.default;
  }
  return WEEKDAY_ACCENT_CLASS[accent] ?? WEEKDAY_ACCENT_CLASS.default;
}

function resolveBackgroundColor(color: string | null | undefined): string {
  if (!color) {
    return BACKGROUND_COLOR_MAP.none;
  }
  return BACKGROUND_COLOR_MAP[color] ?? BACKGROUND_COLOR_MAP.none;
}

type TodayHighlight = {
  backgroundClass: string;
  textClass: string;
};

function resolveTodayHighlight(accent: string | null | undefined): TodayHighlight {
  if (accent === "holiday") {
    return { backgroundClass: "bg-red-600", textClass: "text-white" };
  }

  if (accent === "saturday") {
    return { backgroundClass: "bg-blue-600", textClass: "text-white" };
  }

  return { backgroundClass: "bg-neutral-900", textClass: "text-white" };
}

const BORDER_COLOR = 'var(--color-calendar-border, rgb(229 231 235))';

type CalendarInfoMap = Record<string, CalendarDisplayInfo>;

type WeekState = {
  dates: Date[];
  dateIds: string[];
  loading: boolean;
  loaded: boolean;
  errorMessage: string | null;
};

type WeekStateMap = Record<string, WeekState>;

type WeeklyTermSummary = {
  id: string | null;
  name: string | null;
  shortName?: string | null;
};

type FullOnDemandClass = {
  id: string;
  className: string;
  termIds: string[];
  termNames: string[];
};

type OnDemandEntry = {
  term: WeeklyTermSummary;
  classes: {
    id: string;
    className: string;
  }[];
};

type WeeklyCalendarTabProps = {
  onDateSelect?: (dateId: string) => void;
};

export default function WeeklyCalendarTab({ onDateSelect }: WeeklyCalendarTabProps) {
  const { settings, initialized } = useUserSettings();
  const fiscalYear = settings.calendar.fiscalYear.trim();
  const calendarId = settings.calendar.calendarId.trim();
  const configKey = useMemo(() => `${fiscalYear}::${calendarId}`, [calendarId, fiscalYear]);
  const configKeyRef = useRef(configKey);

  const { classEntriesByDate, classSummaries } = useCalendarClassEntries(fiscalYear);

  const activeCalendarEntry = useMemo(() => {
    if (!fiscalYear || !calendarId) {
      return null;
    }
    return (
      settings.calendar.entries.find(
        (entry) => entry.fiscalYear === fiscalYear && entry.calendarId === calendarId,
      ) ?? null
    );
  }, [calendarId, fiscalYear, settings.calendar.entries]);

  const hasSaturdayClasses = activeCalendarEntry?.hasSaturdayClasses ?? true;

  const [visibleWeekStart, setVisibleWeekStart] = useState(() => startOfWeek(new Date()));
  const [infoMap, setInfoMap] = useState<CalendarInfoMap>({});
  const [weekStates, setWeekStates] = useState<WeekStateMap>({});
  const weekStatesRef = useRef<WeekStateMap>({});

  const [containerWidth, setContainerWidth] = useState(0);
  const [translate, setTranslate] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDirection, setPendingDirection] = useState<'prev' | 'next' | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef(0);
  const dragDeltaRef = useRef(0);
  const isPointerDownRef = useRef(false);

  useEffect(() => {
    weekStatesRef.current = weekStates;
  }, [weekStates]);

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
    setWeekStates({});
    weekStatesRef.current = {};
  }, [configKey]);

  const requestWeekData = useCallback(
    (weekStartDate: Date, options?: { force?: boolean }) => {
      if (!initialized) {
        return undefined;
      }

      const normalizedStart = startOfWeek(weekStartDate);
      const weekKey = getWeekKey(normalizedStart);
      const existing = weekStatesRef.current[weekKey];

      if (!options?.force) {
        if (existing?.loading || existing?.loaded) {
          return undefined;
        }
      } else if (existing?.loading) {
        return undefined;
      }

      const dates = existing?.dates ?? generateWeekDates(normalizedStart);
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

        const state: WeekState = {
          dates,
          dateIds,
          loading: false,
          loaded: false,
          errorMessage: CALENDAR_SETTINGS_ERROR_MESSAGE,
        };

        setWeekStates((prev) => {
          const next = { ...prev, [weekKey]: state };
          weekStatesRef.current = next;
          return next;
        });

        return undefined;
      }

      const loadingState: WeekState = {
        dates,
        dateIds,
        loading: true,
        loaded: false,
        errorMessage: null,
      };

      setWeekStates((prev) => {
        const next = { ...prev, [weekKey]: loadingState };
        weekStatesRef.current = next;
        return next;
      });

      let cancelled = false;
      const requestKey = configKeyRef.current;

      Promise.all(
        dateIds.map(async (dateId) => {
          const info = await getCalendarDisplayInfo(fiscalYear, calendarId, dateId, {
            hasSaturdayClasses,
          });
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
          setWeekStates((prev) => {
            const current = prev[weekKey];
            if (!current) {
              return prev;
            }
            const next: WeekStateMap = {
              ...prev,
              [weekKey]: {
                ...current,
                loading: false,
                loaded: true,
                errorMessage: null,
              },
            };
            weekStatesRef.current = next;
            return next;
          });
        })
        .catch(() => {
          if (cancelled || configKeyRef.current !== requestKey) {
            return;
          }
          setWeekStates((prev) => {
            const current = prev[weekKey];
            if (!current) {
              return prev;
            }
            const next: WeekStateMap = {
              ...prev,
              [weekKey]: {
                ...current,
                loading: false,
                loaded: false,
                errorMessage: '学事情報の取得に失敗しました。',
              },
            };
            weekStatesRef.current = next;
            return next;
          });
        });

      return () => {
        cancelled = true;
      };
    },
    [calendarId, fiscalYear, hasSaturdayClasses, initialized],
  );

  useEffect(() => {
    const weeksToFetch = [addWeeks(visibleWeekStart, -1), visibleWeekStart, addWeeks(visibleWeekStart, 1)];
    const cleanups = weeksToFetch
      .map((week) => requestWeekData(week))
      .filter((cleanup): cleanup is () => void => typeof cleanup === 'function');

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [visibleWeekStart, requestWeekData]);

  const startTransition = useCallback(
    (direction: 'prev' | 'next') => {
      if (isAnimating) {
        return;
      }

      if (containerWidth === 0) {
        setVisibleWeekStart((prev) => addWeeks(prev, direction === 'next' ? 1 : -1));
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
        setVisibleWeekStart((prev) => addWeeks(prev, pendingDirection === 'next' ? 1 : -1));
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
      // no-op
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
      isPointerDownRef.current = true;
      setPendingDirection(null);
      setIsAnimating(false);
    },
    [isAnimating],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isPointerDownRef.current || pointerIdRef.current !== event.pointerId) {
        return;
      }

      const delta = event.clientX - dragStartRef.current;
      let dragging = isDragging;

      if (!dragging) {
        if (Math.abs(delta) <= DRAG_DETECTION_THRESHOLD) {
          return;
        }
        setIsDragging(true);
        dragging = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }

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
    isPointerDownRef.current = false;
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
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }

      releasePointerCapture(event.pointerId);
      if (isDragging) {
        finishDrag();
      } else {
        resetDragState();
      }
    },
    [finishDrag, isDragging, releasePointerCapture, resetDragState],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      releasePointerCapture(event.pointerId);
      if (isDragging) {
        finishDrag({ cancelled: true });
      } else {
        resetDragState();
      }
    },
    [finishDrag, isDragging, releasePointerCapture, resetDragState],
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
  const weeks = useMemo(
    () => [addWeeks(visibleWeekStart, -1), visibleWeekStart, addWeeks(visibleWeekStart, 1)],
    [visibleWeekStart],
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
      width: containerWidth * weeks.length,
      transform: `translate3d(${baseOffset + translate}px, 0, 0)`,
      transition: isAnimating ? 'transform 0.3s ease' : 'none',
    } as const;
  }, [containerWidth, isAnimating, translate, weeks.length]);

  const weekRangeLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const start = visibleWeekStart;
    const end = addDays(visibleWeekStart, 6);
    const startLabel = `${formatter.format(start)}(${WEEKDAY_LABEL_JA[start.getDay()] ?? ''})`;
    const endLabel = `${formatter.format(end)}(${WEEKDAY_LABEL_JA[end.getDay()] ?? ''})`;
    return `${startLabel} 〜 ${endLabel}`;
  }, [visibleWeekStart]);

  const isCalendarConfigured = Boolean(fiscalYear && calendarId);
  const calendarAvailable = initialized && isCalendarConfigured;

  const fullOnDemandClasses = useMemo<FullOnDemandClass[]>(() => {
    return Object.values(classSummaries)
      .filter((item) => item.isFullyOnDemand)
      .map((item) => ({
        id: item.id,
        className: item.className,
        termIds: item.termIds,
        termNames: item.termNames,
      }));
  }, [classSummaries]);

  return (
    <div className="flex h-full w-full flex-col bg-neutral-50">
      <header className="flex h-[60px] w-full items-center border-b border-neutral-200 bg-[var(--color-my-secondary-container)] px-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold text-neutral-900">{weekRangeLabel}</div>
          </div>
          <UserHamburgerMenu buttonAriaLabel="ユーザメニューを開く" />
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {calendarAvailable ? (
          <div className="flex h-full w-full flex-col">
            <div
              ref={viewportRef}
              className="flex w-full flex-1 select-none overflow-hidden touch-pan-y"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerCancel}
            >
              <div className="flex h-full" style={trackStyle} onTransitionEnd={handleTransitionEnd}>
                {weeks.map((weekStartDate) => {
                  const weekKey = getWeekKey(weekStartDate);
                  const state = weekStates[weekKey];
                  const style = containerWidth ? { width: containerWidth } : { width: '100%' };

                  return (
                    <div key={weekKey} className="flex h-full w-full flex-shrink-0" style={style}>
                      <WeekSlide
                        weekStart={weekStartDate}
                        weekState={state}
                        infoMap={infoMap}
                        classEntriesByDate={classEntriesByDate}
                        fullOnDemandClasses={fullOnDemandClasses}
                        todayId={todayId}
                        onDateSelect={onDateSelect}
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

type WeekSlideProps = {
  weekStart: Date;
  weekState: WeekState | undefined;
  infoMap: CalendarInfoMap;
  classEntriesByDate: ClassEntriesByDateMap;
  fullOnDemandClasses: FullOnDemandClass[];
  todayId: string;
  onDateSelect?: (dateId: string) => void;
};

function WeekSlide({
  weekStart,
  weekState,
  infoMap,
  classEntriesByDate,
  fullOnDemandClasses,
  todayId,
  onDateSelect,
}: WeekSlideProps) {
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const primaryMonthKey = getMonthKey(weekStart);
  const secondaryMonthKey = getMonthKey(weekEnd);
  const { eventsByDay: primaryEventsByDay } = useGoogleCalendarEventsForMonth(primaryMonthKey);
  const { eventsByDay: secondaryEventsByDay } = useGoogleCalendarEventsForMonth(secondaryMonthKey);
  const googleEventsByDay = useMemo<Record<string, GoogleCalendarEventRecord[]>>(() => {
    if (primaryMonthKey === secondaryMonthKey) {
      return primaryEventsByDay;
    }
    const merged: Record<string, GoogleCalendarEventRecord[]> = {};
    const mergeSource = (source: Record<string, GoogleCalendarEventRecord[]>) => {
      Object.keys(source).forEach((key) => {
        const list = source[key];
        if (!list || list.length === 0) {
          return;
        }
        if (!merged[key]) {
          merged[key] = [...list];
        } else {
          merged[key] = [...merged[key], ...list];
        }
      });
    };
    mergeSource(primaryEventsByDay);
    mergeSource(secondaryEventsByDay);
    Object.keys(merged).forEach((key) => {
      merged[key].sort((a, b) => a.startTimestamp - b.startTimestamp);
    });
    return merged;
  }, [primaryEventsByDay, primaryMonthKey, secondaryEventsByDay, secondaryMonthKey]);
  const rawDates = weekState?.dates ?? generateWeekDates(weekStart);
  const rawDateIds = weekState?.dateIds ?? rawDates.map((date) => formatDateId(date));

  const dates = rawDates.slice(0, 7);
  const dateIds = rawDateIds.slice(0, dates.length);
  const totalCells = dates.length;
  const isLoading = Boolean(weekState?.loading && !weekState?.loaded);
  const errorMessage = weekState?.errorMessage ?? null;
  const isCalendarSettingsError = errorMessage === CALENDAR_SETTINGS_ERROR_MESSAGE;

  const weeklyTerms: WeeklyTermSummary[] = [];
  const termMap = new Map<string, WeeklyTermSummary>();
  dateIds.forEach((dateId) => {
    const term = infoMap[dateId]?.term;
    if (!term) {
      return;
    }
    const key = term.id ?? `name:${term.name ?? dateId}`;
    if (termMap.has(key)) {
      return;
    }
    termMap.set(key, {
      id: term.id ?? null,
      name: term.name ?? null,
      shortName: term.shortName ?? null,
    });
  });
  termMap.forEach((value) => {
    weeklyTerms.push(value);
  });

  const onDemandByTerm: OnDemandEntry[] = weeklyTerms
    .map((term) => {
      const classes = fullOnDemandClasses
        .filter((classItem) => {
          const matchesId = term.id ? classItem.termIds.includes(term.id) : false;
          const matchesName = term.name ? classItem.termNames.includes(term.name) : false;
          if (term.id && term.name) {
            return matchesId || matchesName;
          }
          if (term.id) {
            return matchesId;
          }
          if (term.name) {
            return matchesName;
          }
          return false;
        })
        .map((classItem) => ({ id: classItem.id, className: classItem.className }))
        .sort((a, b) => a.className.localeCompare(b.className, 'ja'));
      return { term, classes } satisfies OnDemandEntry;
    })
    .filter((entry) => entry.classes.length > 0);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="grid h-full w-full grid-cols-2 grid-rows-4" style={{ border: `1px solid ${BORDER_COLOR}` }}>
        {dates.map((date, index) => {
          const dateId = dateIds[index];
          const info = infoMap[dateId];
          const general = info?.calendar ?? null;
          const academic = info?.academic ?? null;
          const classEntries = classEntriesByDate[dateId] ?? [];
          const visibleClassEntries = classEntries.filter((entry) => !entry.isCancelled);
          const googleEvents = googleEventsByDay[dateId] ?? [];

          const isToday = dateId === todayId;
          const dateNumber = extractDayNumber(general?.dateLabel ?? dateId);
          const weekdayLabel = general?.weekdayLabel ?? '-';
          const accentClass = resolveAccentColor(general?.dateTextColor);
          const todayHighlight = resolveTodayHighlight(general?.dateTextColor);
          const cellBackground = resolveBackgroundColor(academic?.backgroundColor);

          const dateNumberClassName = `text-lg font-semibold ${
            isToday ? todayHighlight.textClass : accentClass
          }`;
          const weekdayClassName = `text-xs font-semibold ${
            isToday ? todayHighlight.textClass : accentClass
          }`;
          const dateHeaderPaddingClassName = "px-2 pb-1 pt-1";
          const todayHeaderHighlightClassName = `pointer-events-none absolute inset-0 rounded-none rounded-br-md ${todayHighlight.backgroundClass}`;

          const showRightBorder = (index + 1) % WEEK_COLUMN_COUNT !== 0;
          const showBottomBorder = index < totalCells - WEEK_COLUMN_COUNT;

          const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onDateSelect?.(dateId);
            }
          };

          const accessibleLabel = general?.dateLabel ?? dateId;

          return (
            <div
              key={dateId}
              role="button"
              tabIndex={0}
              aria-label={accessibleLabel}
              onClick={() => onDateSelect?.(dateId)}
              onKeyDown={handleKeyDown}
              className="flex min-h-0 w-full flex-col bg-white outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              style={{
                backgroundColor: cellBackground,
                borderRight: showRightBorder ? `1px solid ${BORDER_COLOR}` : undefined,
                borderBottom: showBottomBorder ? `1px solid ${BORDER_COLOR}` : undefined,
                cursor: onDateSelect ? 'pointer' : undefined,
              }}
            >
              <div className="relative flex h-[40px] items-start justify-between gap-2 overflow-hidden bg-transparent">
                <div className="relative inline-flex items-center self-start">
                  {isToday ? <div className={todayHeaderHighlightClassName} /> : null}
                  <div className={`relative z-[1] flex items-center gap-1 ${dateHeaderPaddingClassName} leading-none`}>
                    <span className={dateNumberClassName}>{dateNumber}</span>
                    <span className={weekdayClassName}>{weekdayLabel}</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-end justify-end gap-[2px] px-2 pb-2 pt-1 text-right">
                  <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-neutral-700">
                    {academic?.label ?? '-'}
                  </span>
                  {academic?.subLabel ? (
                    <span className="truncate text-[10px] leading-tight text-neutral-500">{academic.subLabel}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto px-2 py-2 touch-pan-y">
                {visibleClassEntries.map((entry) => {
                  const { icon, className: iconClass } = resolveSessionIcon(
                    entry.classType,
                    entry.deliveryType,
                  );
                  return (
                    <div
                      key={entry.id}
                      className="flex min-h-[18px] items-center gap-1 text-[12px] leading-[1.15] text-neutral-800"
                    >
                      <FontAwesomeIcon icon={icon} className={`${iconClass} flex-shrink-0`} fontSize={12} />
                      <span className="flex-1 truncate">{entry.className}</span>
                    </div>
                  );
                })}
                {googleEvents.length > 0 ? (
                  <div className="mt-1 flex flex-col gap-[2px]">
                    {googleEvents.slice(0, 3).map((event: GoogleCalendarEventRecord) => (
                      <div
                        key={event.eventUid}
                        className="flex min-h-[16px] items-start gap-[6px] text-[11px] leading-tight text-blue-700"
                      >
                        <span className="flex-shrink-0">●</span>
                        <span className="flex-1 truncate">{event.summary || '予定'}</span>
                      </div>
                    ))}
                    {googleEvents.length > 3 ? (
                      <span className="pl-[14px] text-[10px] font-medium text-blue-500">
                        他 {googleEvents.length - 3} 件
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        <div
          className="flex min-h-0 w-full flex-col bg-white"
          style={{ borderTop: `1px solid ${BORDER_COLOR}` }}
        >
          <div className="flex h-[40px] items-end justify-between gap-2 overflow-hidden bg-white px-2 pb-2 pt-1">
            <span className="text-sm font-semibold text-neutral-800">フルオンデマンド</span>
            <FontAwesomeIcon icon={faVideo} className="text-neutral-500" fontSize={14} />
          </div>
          <div className="flex flex-1 flex-col gap-2 px-2 py-2 text-[11px] text-neutral-800">
            {onDemandByTerm.length > 0 ? (
              onDemandByTerm.map((entry) => {
                const termLabel = entry.term.shortName ?? entry.term.name ?? '学期情報なし';
                return (
                  <div key={`${entry.term.id ?? 'term'}-${termLabel}`} className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-neutral-600">{termLabel}</span>
                    <ul className="flex flex-col gap-[2px]">
                      {entry.classes.map((item) => (
                        <li key={item.id} className="truncate">
                          {item.className}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-[11px] text-neutral-500">
                {fullOnDemandClasses.length > 0
                  ? '該当するオンデマンド授業はありません'
                  : 'オンデマンド授業は登録されていません'}
              </div>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="px-3 py-2 text-center text-xs text-neutral-500">読み込み中...</div>
      ) : null}

      {errorMessage && !isCalendarSettingsError ? (
        <div className="px-3 py-2 text-center text-xs text-red-600">{errorMessage}</div>
      ) : null}
    </div>
  );
}
