'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight, faVideo } from '@fortawesome/free-solid-svg-icons';

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
} from './calendarShared';

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

const WEEKDAY_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#60a5fa', '#a855f7'];
const WEEKDAY_LABEL_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

type WeeklyTermSummary = {
  id: string | null;
  name: string | null;
  shortName?: string | null;
};

type OnDemandEntry = {
  term: WeeklyTermSummary;
  classes: {
    id: string;
    className: string;
  }[];
};

export default function WeeklyCalendarTab() {
  const { settings, initialized } = useUserSettings();
  const fiscalYear = settings.calendar.fiscalYear.trim();
  const calendarId = settings.calendar.calendarId.trim();

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

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekDateIds = useMemo(() => weekDates.map((date) => formatDateId(date)), [weekDates]);
  const todayId = useMemo(() => formatDateId(new Date()), []);

  const { classEntriesByDate, classSummaries } = useCalendarClassEntries(fiscalYear);

  const [infoMap, setInfoMap] = useState<Record<string, CalendarDisplayInfo>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCalendarConfigured = fiscalYear.length > 0 && calendarId.length > 0;
  const calendarAvailable = initialized && isCalendarConfigured;

  useEffect(() => {
    if (!calendarAvailable) {
      setInfoMap({});
      if (initialized && !isCalendarConfigured) {
        setError(CALENDAR_SETTINGS_ERROR_MESSAGE);
      } else {
        setError(null);
      }
      setLoading(false);
      return;
    }

    let canceled = false;
    setLoading(true);
    setError(null);

    async function loadWeekInfo() {
      try {
        const results = await Promise.all(
          weekDateIds.map(async (dateId) => {
            const info = await getCalendarDisplayInfo(fiscalYear, calendarId, dateId, {
              hasSaturdayClasses,
            });
            return { dateId, info } as const;
          }),
        );
        if (canceled) {
          return;
        }
        const next: Record<string, CalendarDisplayInfo> = {};
        results.forEach(({ dateId, info }) => {
          next[dateId] = info;
        });
        setInfoMap(next);
      } catch (err) {
        console.error('Failed to load weekly calendar information', err);
        if (!canceled) {
          setError('週カレンダーの読み込みに失敗しました。');
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    loadWeekInfo();

    return () => {
      canceled = true;
    };
  }, [calendarAvailable, calendarId, fiscalYear, hasSaturdayClasses, initialized, weekDateIds]);

  const weeklyTerms = useMemo<WeeklyTermSummary[]>(() => {
    const map = new Map<string, WeeklyTermSummary>();
    weekDateIds.forEach((dateId) => {
      const term = infoMap[dateId]?.term;
      if (!term) {
        return;
      }
      const key = term.id ?? `name:${term.name ?? dateId}`;
      if (!map.has(key)) {
        map.set(key, {
          id: term.id ?? null,
          name: term.name ?? null,
          shortName: term.shortName ?? null,
        });
      }
    });
    return Array.from(map.values());
  }, [infoMap, weekDateIds]);

  const fullOnDemandClasses = useMemo(() => {
    return Object.values(classSummaries).filter((item) => item.isFullyOnDemand);
  }, [classSummaries]);

  const onDemandByTerm = useMemo<OnDemandEntry[]>(() => {
    if (weeklyTerms.length === 0 || fullOnDemandClasses.length === 0) {
      return [];
    }
    return weeklyTerms
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
  }, [fullOnDemandClasses, weeklyTerms]);

  const weekRangeLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const startLabel = `${formatter.format(weekStart)}(${WEEKDAY_LABEL_JA[weekStart.getDay()] ?? ''})`;
    const endLabel = `${formatter.format(weekEnd)}(${WEEKDAY_LABEL_JA[weekEnd.getDay()] ?? ''})`;
    return `${startLabel} 〜 ${endLabel}`;
  }, [weekEnd, weekStart]);

  const handlePrevWeek = useCallback(() => {
    setWeekStart((prev) => startOfWeek(addDays(prev, -7)));
  }, []);

  const handleNextWeek = useCallback(() => {
    setWeekStart((prev) => startOfWeek(addDays(prev, 7)));
  }, []);

  const handleResetWeek = useCallback(() => {
    setWeekStart(startOfWeek(new Date()));
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-neutral-50">
      <header className="flex h-[60px] w-full items-center border-b border-neutral-200 bg-[var(--color-my-secondary-container)] px-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-lg font-semibold text-neutral-900">週カレンダー</div>
          <UserHamburgerMenu buttonAriaLabel="ユーザメニューを開く" />
        </div>
      </header>

      <div className="flex h-full w-full flex-col">
        <div className="flex w-full items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
          <button
            type="button"
            onClick={handlePrevWeek}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-600 transition hover:border-blue-300 hover:text-blue-600"
            aria-label="前の週を表示"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <div className="flex min-w-0 flex-1 justify-center px-3 text-center text-sm font-semibold text-neutral-700">
            <span className="truncate">{weekRangeLabel}</span>
          </div>
          <button
            type="button"
            onClick={handleNextWeek}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-600 transition hover:border-blue-300 hover:text-blue-600"
            aria-label="次の週を表示"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
        <div className="flex w-full justify-end border-b border-neutral-200 bg-white px-4 py-2">
          <button
            type="button"
            onClick={handleResetWeek}
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-600 transition hover:border-blue-300 hover:text-blue-600"
          >
            今週
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {calendarAvailable ? (
            <div
              className="grid w-full gap-3"
              style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: 'repeat(4, minmax(160px, auto))' }}
            >
              {weekDateIds.map((dateId, index) => {
                const info = infoMap[dateId] ?? null;
                const general = info?.calendar ?? null;
                const academic = info?.academic ?? null;
                const day = info?.day ?? null;
                const classEntries = classEntriesByDate[dateId] ?? [];

                const isToday = dateId === todayId;
                const dateNumber = extractDayNumber(general?.dateLabel ?? dateId);
                const weekdayLabel = general?.weekdayLabel ?? '-';
                const accentClass = resolveAccentColor(general?.dateTextColor);
                const cellBackground = isToday
                  ? 'var(--color-calendar-today-background)'
                  : resolveBackgroundColor(academic?.backgroundColor);

                const isClassDay = day?.type === '授業日';
                const classOrder = typeof academic?.classOrder === 'number' ? academic.classOrder : null;
                const classWeekday = typeof academic?.weekdayNumber === 'number' ? academic.weekdayNumber : null;
                const weekdayColor =
                  typeof classWeekday === 'number' ? WEEKDAY_COLORS[classWeekday] ?? '#2563eb' : '#2563eb';

                return (
                  <div
                    key={dateId}
                    className="flex h-full min-h-[160px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
                    style={{ backgroundColor: cellBackground }}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-neutral-200 bg-white/70 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-baseline gap-1">
                          <span className={`text-lg font-semibold ${accentClass}`}>{dateNumber}</span>
                          <span className={`text-xs font-semibold ${accentClass}`}>{weekdayLabel}</span>
                        </div>
                        {isClassDay && classOrder ? (
                          <span
                            className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ backgroundColor: weekdayColor }}
                          >
                            {classOrder}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-col items-end text-right">
                        <span className="truncate text-[11px] font-semibold text-neutral-700">
                          {academic?.label ?? '-'}
                        </span>
                        {academic?.subLabel ? (
                          <span className="truncate text-[10px] text-neutral-500">{academic.subLabel}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-1 px-3 py-2">
                      {classEntries.length > 0 ? (
                        classEntries.map((entry) => {
                          const { icon, className: iconClass } = resolveSessionIcon(
                            entry.classType,
                            entry.deliveryType,
                          );
                          return (
                            <div
                              key={entry.id}
                              className="flex min-h-[18px] items-center gap-1 text-[11px] leading-tight text-neutral-800"
                            >
                              <FontAwesomeIcon icon={icon} className={`${iconClass} flex-shrink-0`} fontSize={11} />
                              <span className="flex-1 truncate">{entry.className}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-1 items-center justify-center text-[11px] text-neutral-500">
                          授業は登録されていません
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="flex h-full min-h-[160px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/70 px-3 py-2">
                  <div className="text-sm font-semibold text-neutral-800">フルオンデマンド</div>
                  <FontAwesomeIcon icon={faVideo} className="text-neutral-500" fontSize={14} />
                </div>
                <div className="flex flex-1 flex-col gap-2 px-3 py-2">
                  {onDemandByTerm.length > 0 ? (
                    onDemandByTerm.map((entry) => {
                      const termLabel = entry.term.shortName ?? entry.term.name ?? '学期情報なし';
                      return (
                        <div key={`${entry.term.id ?? 'term'}-${termLabel}`} className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-neutral-600">{termLabel}</span>
                          <ul className="flex flex-col gap-[2px]">
                            {entry.classes.map((item) => (
                              <li key={item.id} className="truncate text-[11px] text-neutral-800">
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
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-4 py-6 text-center text-sm text-neutral-600">
              {!initialized ? '学事カレンダー設定を読み込み中です...' : CALENDAR_SETTINGS_ERROR_MESSAGE}
            </div>
          )}

          {loading ? (
            <div className="mt-3 text-center text-xs text-neutral-500">読み込み中...</div>
          ) : null}

          {error && error !== CALENDAR_SETTINGS_ERROR_MESSAGE ? (
            <div className="mt-3 text-center text-xs text-red-600">{error}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
