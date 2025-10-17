'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type CalendarEntry = {
  fiscalYear: string;
  calendarId: string;
};

type CalendarSettings = {
  fiscalYear: string;
  calendarId: string;
  entries: CalendarEntry[];
};

type UserSettings = {
  calendar: CalendarSettings;
};

type UserSettingsContextValue = {
  settings: UserSettings;
  saveCalendarSettings: (next: CalendarSettings) => void;
  resetCalendarSettings: () => void;
  initialized: boolean;
};

const STORAGE_KEY = 'campusCalendar.userSettings';

const DEFAULT_CALENDAR_ENTRY: CalendarEntry = {
  fiscalYear: '2025',
  calendarId: 'jd70dxbqvevcf5kj43cbaf4rjn7rs93e',
};

const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  fiscalYear: DEFAULT_CALENDAR_ENTRY.fiscalYear,
  calendarId: DEFAULT_CALENDAR_ENTRY.calendarId,
  entries: [DEFAULT_CALENDAR_ENTRY],
};

const createDefaultSettings = (): UserSettings => ({
  calendar: { ...DEFAULT_CALENDAR_SETTINGS },
});

function normalizeCalendarEntries(entries: unknown): CalendarEntry[] {
  if (!Array.isArray(entries)) {
    return [...DEFAULT_CALENDAR_SETTINGS.entries];
  }

  const normalized: CalendarEntry[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const fiscalYear = typeof (entry as { fiscalYear?: unknown }).fiscalYear === 'string'
      ? (entry as { fiscalYear: string }).fiscalYear.trim()
      : '';
    const calendarId = typeof (entry as { calendarId?: unknown }).calendarId === 'string'
      ? (entry as { calendarId: string }).calendarId.trim()
      : '';

    if (!fiscalYear || !calendarId) {
      continue;
    }

    if (normalized.some((item) => item.fiscalYear === fiscalYear && item.calendarId === calendarId)) {
      continue;
    }

    normalized.push({ fiscalYear, calendarId });
  }

  if (normalized.length === 0) {
    return [...DEFAULT_CALENDAR_SETTINGS.entries];
  }

  return normalized;
}

function ensureActiveEntryExists(settings: CalendarSettings): CalendarSettings {
  const { fiscalYear, calendarId, entries } = settings;
  const exists = entries.some(
    (entry) => entry.fiscalYear === fiscalYear && entry.calendarId === calendarId,
  );
  if (exists) {
    return settings;
  }
  const trimmedFiscalYear = fiscalYear.trim();
  const trimmedCalendarId = calendarId.trim();
  if (!trimmedFiscalYear || !trimmedCalendarId) {
    return {
      ...settings,
      fiscalYear: entries[0]?.fiscalYear ?? DEFAULT_CALENDAR_ENTRY.fiscalYear,
      calendarId: entries[0]?.calendarId ?? DEFAULT_CALENDAR_ENTRY.calendarId,
    };
  }
  return {
    ...settings,
    entries: [...entries, { fiscalYear: trimmedFiscalYear, calendarId: trimmedCalendarId }],
  };
}

const UserSettingsContext = createContext<UserSettingsContextValue | undefined>(undefined);

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(createDefaultSettings);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UserSettings>;
        setSettings((prev) => {
          const nextFiscalYear =
            typeof parsed?.calendar?.fiscalYear === 'string'
              ? parsed.calendar.fiscalYear.trim()
              : prev.calendar.fiscalYear;
          const nextCalendarId =
            typeof parsed?.calendar?.calendarId === 'string'
              ? parsed.calendar.calendarId.trim()
              : prev.calendar.calendarId;
          const parsedEntries = normalizeCalendarEntries(parsed?.calendar?.entries);

          const mergedEntries = (() => {
            const existing = parsedEntries.length > 0 ? parsedEntries : prev.calendar.entries;
            const deduped = existing.filter((entry, index, array) =>
              array.findIndex(
                (target) =>
                  target.fiscalYear === entry.fiscalYear && target.calendarId === entry.calendarId,
              ) === index,
            );
            return deduped.length > 0 ? deduped : [...DEFAULT_CALENDAR_SETTINGS.entries];
          })();

          const nextSettings = ensureActiveEntryExists({
            fiscalYear: nextFiscalYear,
            calendarId: nextCalendarId,
            entries: mergedEntries,
          });

          return {
            calendar: nextSettings,
          };
        });
      }
    } catch (error) {
      console.error('ユーザー設定の読み込みに失敗しました。', error);
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (!initialized || typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('ユーザー設定の保存に失敗しました。', error);
    }
  }, [initialized, settings]);

  const value = useMemo<UserSettingsContextValue>(
    () => ({
      settings,
      saveCalendarSettings: (next) => {
        const trimmedFiscalYear = next.fiscalYear.trim();
        const trimmedCalendarId = next.calendarId.trim();
        const normalizedEntries = next.entries
          .map((entry) => ({
            fiscalYear: entry.fiscalYear.trim(),
            calendarId: entry.calendarId.trim(),
          }))
          .filter((entry) => entry.fiscalYear.length > 0 && entry.calendarId.length > 0);

        const uniqueEntries = normalizedEntries.filter((entry, index, array) =>
          array.findIndex(
            (target) =>
              target.fiscalYear === entry.fiscalYear && target.calendarId === entry.calendarId,
          ) === index,
        );

        const entries = uniqueEntries.length > 0 ? uniqueEntries : [...DEFAULT_CALENDAR_SETTINGS.entries];
        const fallback = entries[0];
        const fiscalYear = trimmedFiscalYear || fallback.fiscalYear;
        const calendarId = trimmedCalendarId || fallback.calendarId;

        const nextSettings = ensureActiveEntryExists({ fiscalYear, calendarId, entries });

        setSettings((prev) => ({
          ...prev,
          calendar: nextSettings,
        }));
      },
      resetCalendarSettings: () => {
        setSettings((prev) => ({
          ...prev,
          calendar: { ...DEFAULT_CALENDAR_SETTINGS },
        }));
      },
      initialized,
    }),
    [initialized, settings],
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error('useUserSettings は UserSettingsProvider 内で使用してください。');
  }
  return context;
}

export { DEFAULT_CALENDAR_SETTINGS, createDefaultSettings as createDefaultUserSettings };
