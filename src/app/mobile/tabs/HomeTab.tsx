'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import {
  getCalendarDisplayInfo,
  type CalendarDisplayInfo,
} from '@/lib/data/service/calendarDisplay.service';
import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import UserHamburgerMenu from '../components/UserHamburgerMenu';

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

function resolveAccentColor(accent: string | null | undefined): string {
  return ACCENT_COLOR_CLASS[accent ?? ''] ?? ACCENT_COLOR_CLASS.default;
}

function resolveBackgroundColor(color: string | null | undefined): string {
  if (!color) {
    return BACKGROUND_COLOR_MAP.none;
  }
  return BACKGROUND_COLOR_MAP[color] ?? BACKGROUND_COLOR_MAP.none;
}

function normalizeDateId(value: string | null): string {
  const today = new Date();
  const fallback = today.toISOString().slice(0, 10);
  if (!value) {
    return fallback;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }
  return value;
}

function extractDayNumber(label: string): string {
  const match = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return label;
  }
  return String(Number(match[3]));
}

function HomeTabContent() {
  const searchParams = useSearchParams();
  const { settings } = useUserSettings();
  const [displayInfo, setDisplayInfo] = useState<CalendarDisplayInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dateId = useMemo(
    () => normalizeDateId(searchParams?.get('date') ?? null),
    [searchParams],
  );

  useEffect(() => {
    let active = true;
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

    getCalendarDisplayInfo(fiscalYear, calendarId, dateId)
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
  }, [dateId, settings.calendar.calendarId, settings.calendar.fiscalYear]);

  const general = displayInfo?.calendar;
  const academic = displayInfo?.academic;

  const dateLabel = general?.dateLabel ?? dateId;
  const dayNumber = extractDayNumber(dateLabel);
  const weekdayLabel = general?.weekdayLabel?.toUpperCase() ?? '-';
  const supplementalText = general?.calendarSupplementalText ?? '-';

  const dateColorClass = resolveAccentColor(general?.dateTextColor);
  const weekdayColorClass = resolveAccentColor(general?.weekdayTextColor);
  const backgroundColor = resolveBackgroundColor(academic?.backgroundColor);

  return (
    <div className="flex min-h-full flex-col">
      <section
        className="relative flex w-full min-h-[200px] flex-col justify-end px-8 pt-6 pb-8 shadow-sm"
        style={{ backgroundColor }}
      >
        <div className="absolute right-8 top-6">
          <UserHamburgerMenu />
        </div>
        {loading ? (
          <div className="mt-12 text-center text-sm text-neutral-700">読み込み中...</div>
        ) : errorMessage ? (
          <div className="mt-12 text-center text-sm text-red-600">{errorMessage}</div>
        ) : (
          <div className="flex w-full items-end justify-between gap-8 pt-12">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-3">
                <p
                  className={`text-[72px] font-semibold leading-none tracking-tight ${dateColorClass}`}
                >
                  {dayNumber}
                </p>
                <span
                  className={`text-2xl font-semibold tracking-wide ${weekdayColorClass}`}
                >
                  {weekdayLabel}
                </span>
              </div>
              <span className="text-sm text-neutral-500">{supplementalText}</span>
            </div>
            <div className="flex min-h-[120px] flex-col items-end justify-end text-right">
              <span className="text-lg font-semibold text-neutral-900">
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
      <div className="flex-1 p-6 text-sm text-neutral-500">
        {loading ? '読み込み中の情報が表示されます。' : '今日の予定を確認しましょう。'}
      </div>
    </div>
  );
}

export default function HomeTab() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center p-6 text-sm text-neutral-600">
          読み込み中...
        </div>
      }
    >
      <HomeTabContent />
    </Suspense>
  );
}
