'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type CalendarSettings = {
  fiscalYear: string;
  calendarId: string;
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

const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  fiscalYear: '2025',
  calendarId: 'jd70dxbqvevcf5kj43cbaf4rjn7rs93e',
};

const createDefaultSettings = (): UserSettings => ({
  calendar: { ...DEFAULT_CALENDAR_SETTINGS },
});

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
        setSettings((prev) => ({
          calendar: {
            fiscalYear:
              typeof parsed?.calendar?.fiscalYear === 'string'
                ? parsed.calendar.fiscalYear
                : prev.calendar.fiscalYear,
            calendarId:
              typeof parsed?.calendar?.calendarId === 'string'
                ? parsed.calendar.calendarId
                : prev.calendar.calendarId,
          },
        }));
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
        setSettings((prev) => ({
          ...prev,
          calendar: {
            fiscalYear: next.fiscalYear,
            calendarId: next.calendarId,
          },
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
