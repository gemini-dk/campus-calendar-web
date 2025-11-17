'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

import {
  getCalendarDisplayInfo,
  type CalendarDisplayInfo,
} from '@/lib/data/service/calendarDisplay.service';
import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';
import UserHamburgerMenu from './UserHamburgerMenu';
import ClassActivityOverlay, {
  type ClassActivityOverlaySession,
} from './ClassActivityOverlay';
import DailyClassesSection, {
  type DailyClassSession,
} from '../tabs/HomeTab/DailyClassesSection';
import {
  ScheduleAdjustmentDialogProvider,
  useScheduleAdjustmentDialog,
} from './ScheduleAdjustmentDialogProvider';
import { formatPeriodLabel } from '@/app/mobile/utils/classSchedule';
import { useGoogleCalendarEventsForDay } from '@/lib/google-calendar/hooks/useGoogleCalendarEvents';
import type { GoogleCalendarEventRecord } from '@/lib/google-calendar/types';


const ACCENT_COLOR_CLASS: Record<string, string> = {
  default: 'text-neutral-900',
  holiday: 'text-red-500',
  saturday: 'text-blue-600',
};

const BACKGROUND_COLOR_MAP: Record<string, string> = {
  none: 'var(--color-my-secondary-container)',
  sunday: 'var(--color-my-background-dim)',
  holiday: 'var(--color-my-background-dim)',
  exam: 'var(--color-calendar-exam-background)',
  reserve: 'var(--color-my-secondary-container)',
};

type DailyCalendarViewProps = {
  dateId: string;
  onClose?: () => void;
};

function resolveThemeColorValue(color: string | null | undefined, fallback: string): string {
  if (!color) {
    return fallback;
  }

  const trimmedColor = color.trim();
  if (trimmedColor.startsWith('var(')) {
    const start = trimmedColor.indexOf('(');
    const end = trimmedColor.lastIndexOf(')');
    if (start >= 0 && end > start) {
      const inner = trimmedColor.slice(start + 1, end);
      const [variableToken, fallbackToken] = inner.split(',');
      const variableName = variableToken?.trim();
      if (variableName) {
        const rootStyles = getComputedStyle(document.documentElement);
        const resolvedValue = rootStyles.getPropertyValue(variableName).trim();
        if (resolvedValue) {
          return resolvedValue;
        }
      }
      const fallbackValue = fallbackToken?.trim();
      if (fallbackValue) {
        return fallbackValue;
      }
    }
  }

  return trimmedColor || fallback;
}

function resolveAccentColor(accent: string | null | undefined): string {
  return ACCENT_COLOR_CLASS[accent ?? ''] ?? ACCENT_COLOR_CLASS.default;
}

function resolveBackgroundColor(color: string | null | undefined): string {
  if (!color) {
    return BACKGROUND_COLOR_MAP.none;
  }
  return BACKGROUND_COLOR_MAP[color] ?? BACKGROUND_COLOR_MAP.none;
}

function normalizeDateId(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

function extractDayNumber(label: string): string {
  const match = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return label;
  }
  return String(Number(match[3]));
}

function formatEventTime(event: GoogleCalendarEventRecord): string {
  if (event.allDay) {
    return '終日';
  }
  const start = formatEventTimeLabel(event.startRaw.dateTime, event.startRaw.timeZone);
  const end = formatEventTimeLabel(event.endRaw.dateTime, event.endRaw.timeZone);
  return `${start} - ${end}`;
}

function formatEventTimeLabel(dateTime: string | null, timeZone: string | null): string {
  if (!dateTime) {
    return '--:--';
  }
  try {
    const date = new Date(dateTime);
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timeZone ?? undefined,
    });
    return formatter.format(date);
  } catch {
    return '--:--';
  }
}

export default function DailyCalendarView({ dateId, onClose }: DailyCalendarViewProps) {
  return (
    <ScheduleAdjustmentDialogProvider>
      <DailyCalendarViewContent dateId={dateId} onClose={onClose} />
    </ScheduleAdjustmentDialogProvider>
  );
}

function DailyCalendarViewContent({ dateId, onClose }: DailyCalendarViewProps) {
  const normalizedDateId = useMemo(() => normalizeDateId(dateId), [dateId]);
  const { settings, initialized: settingsInitialized } = useUserSettings();
  const { profile, initializing: authInitializing, isAuthenticated } = useAuth();
  const { events: googleEvents, loading: googleEventsLoading } = useGoogleCalendarEventsForDay(
    normalizedDateId,
  );
  const [displayInfo, setDisplayInfo] = useState<CalendarDisplayInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ClassActivityOverlaySession | null>(null);
  const { openDialog: openScheduleDialog } = useScheduleAdjustmentDialog();

  const activeCalendarEntry = useMemo(() => {
    return (
      settings.calendar.entries.find(
        (entry) =>
          entry.fiscalYear === settings.calendar.fiscalYear &&
          entry.calendarId === settings.calendar.calendarId,
      ) ?? null
    );
  }, [settings.calendar.calendarId, settings.calendar.entries, settings.calendar.fiscalYear]);

  const hasSaturdayClasses = activeCalendarEntry?.hasSaturdayClasses ?? true;

  const handleRequestScheduleChange = useCallback(
    (session: DailyClassSession) => {
      const activeFiscalYear = settings.calendar.fiscalYear?.trim();
      if (!activeFiscalYear) {
        return;
      }
      openScheduleDialog({
        classId: session.classId,
        className: session.className,
        classDateId: session.classDateId,
        classDate: session.classDate,
        periods: session.periods,
        fiscalYear: activeFiscalYear,
      });
    },
    [openScheduleDialog, settings.calendar.fiscalYear],
  );

  useEffect(() => {
    let active = true;

    if (!settingsInitialized) {
      setDisplayInfo(null);
      setErrorMessage(null);
      setLoading(true);
      return () => {
        active = false;
      };
    }

    const fiscalYear = settings.calendar.fiscalYear;
    const calendarId = settings.calendar.calendarId;

    if (!fiscalYear || !calendarId) {
      setDisplayInfo(null);
      setErrorMessage('学事カレンダー設定が未入力です。設定タブで保存してください。');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setErrorMessage(null);

    getCalendarDisplayInfo(fiscalYear, calendarId, normalizedDateId, { hasSaturdayClasses })
      .then((info) => {
        if (!active) {
          return;
        }
        setDisplayInfo(info);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setErrorMessage('学事情報の取得に失敗しました。');
        setDisplayInfo(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    normalizedDateId,
    hasSaturdayClasses,
    settingsInitialized,
    settings.calendar.calendarId,
    settings.calendar.entries,
    settings.calendar.fiscalYear,
  ]);

  const general = displayInfo?.calendar;
  const academic = displayInfo?.academic;

  const dateLabel = general?.dateLabel ?? normalizedDateId;
  const dayNumber = extractDayNumber(dateLabel);
  const weekdayLabel = general?.weekdayLabel?.toUpperCase() ?? '-';
  const supplementalText = general?.calendarSupplementalText ?? '-';

  const dateColorClass = resolveAccentColor(general?.dateTextColor);
  const weekdayColorClass = resolveAccentColor(general?.weekdayTextColor);
  const backgroundColor = resolveBackgroundColor(academic?.backgroundColor);

  useEffect(() => {
    const defaultThemeColor = '#f5f9ff';
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      themeMeta.content = defaultThemeColor;
      document.head.appendChild(themeMeta);
    }

    const previousThemeColor = themeMeta.getAttribute('content') ?? defaultThemeColor;
    const nextThemeColor = resolveThemeColorValue(backgroundColor, defaultThemeColor);
    themeMeta.setAttribute('content', nextThemeColor);

    return () => {
      themeMeta?.setAttribute('content', previousThemeColor);
    };
  }, [backgroundColor]);

  useEffect(() => {
    if (!onClose) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleSelectClassSession = useCallback((session: DailyClassSession) => {
    setSelectedActivity({
      classId: session.classId,
      className: session.className,
      periods: session.periods,
      detailLabel: formatPeriodLabel(session.periods),
    });
  }, []);

  const handleCloseClassActivity = useCallback(() => {
    setSelectedActivity(null);
  }, []);

  return (
    <>
      <div className="flex min-h-full flex-col">
        <section
          className="relative flex w-full min-h-[100px] flex-col justify-end px-8 pt-0 pb-2 shadow-sm"
          style={{ backgroundColor }}
        >
          <div className="absolute right-4 top-3 flex items-center gap-2">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="画面を閉じる"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-100"
              >
                <FontAwesomeIcon icon={faXmark} fontSize={20} />
              </button>
            ) : (
              <UserHamburgerMenu />
            )}
          </div>
          {loading ? (
            <div className="mt-4 text-center text-sm text-neutral-700">読み込み中...</div>
          ) : errorMessage ? (
            <div className="mt-4 text-center text-sm text-red-600">{errorMessage}</div>
          ) : (
            <div className="flex w-full items-end justify-between gap-8 pt-2">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <p className={`text-[56px] font-semibold leading-none tracking-tight ${dateColorClass}`}>
                    {dayNumber}
                  </p>
                  <span className={`text-lg font-semibold tracking-wide ${weekdayColorClass}`}>
                    {weekdayLabel}
                  </span>
                </div>
                <span className="text-sm text-neutral-500">{supplementalText}</span>
              </div>
              <div className="flex min-h-[96px] flex-col items-end justify-end text-right">
                <span className="text-base font-semibold text-neutral-900">
                  {academic?.label ?? '-'}
                </span>
                {academic?.subLabel ? (
                  <span className="mt-1 text-xs font-semibold tracking-wide text-neutral-800">
                    {academic.subLabel}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </section>
        <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-3 pb-16 pt-6">
          <DailyClassesSection
            userId={profile?.uid ?? null}
            fiscalYear={settings.calendar.fiscalYear}
            dateId={normalizedDateId}
            authInitializing={authInitializing}
            isAuthenticated={isAuthenticated}
            onSelectClass={handleSelectClassSession}
            onRequestScheduleChange={handleRequestScheduleChange}
          />

          {(googleEventsLoading || googleEvents.length > 0) ? (
            <div className="mt-6 flex w-full flex-col gap-3">
              <h2 className="text-base font-semibold text-neutral-900">Googleカレンダー</h2>
              {googleEventsLoading ? (
                <p className="text-sm text-neutral-600">予定を読み込み中です...</p>
              ) : (
                <ul className="flex w-full flex-col gap-3">
                  {googleEvents.map((event) => (
                    <li
                      key={event.eventUid}
                      className="w-full rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-neutral-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-blue-700">{formatEventTime(event)}</span>
                        {event.htmlLink ? (
                          <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-blue-600 underline"
                          >
                            開く
                          </a>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-neutral-900">{event.summary || '予定'}</p>
                      {event.location ? (
                        <p className="mt-1 text-xs text-neutral-500">場所: {event.location}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <ClassActivityOverlay
        open={Boolean(selectedActivity)}
        session={selectedActivity}
        fiscalYear={settings.calendar.fiscalYear ?? null}
        onClose={handleCloseClassActivity}
      />
    </>
  );
}
