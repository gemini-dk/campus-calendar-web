'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/useAuth';

const DEFAULT_LESSONS_PER_DAY = 6;

function sanitizeLessonsPerDay(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return DEFAULT_LESSONS_PER_DAY;
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

export type CalendarEntry = {
  fiscalYear: string;
  calendarId: string;
  calendarName: string;
  universityName: string;
  webId: string;
  lessonsPerDay: number;
  hasSaturdayClasses: boolean;
  defaultFlag: boolean;
};

type CalendarSettings = {
  fiscalYear: string;
  calendarId: string;
  entries: CalendarEntry[];
};

type UserSettings = {
  calendar: CalendarSettings;
};

const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  fiscalYear: '',
  calendarId: '',
  entries: [],
};

export type InstallCalendarInput = {
  fiscalYear: string;
  calendarId: string;
  calendarName: string;
  universityName: string;
  webId: string;
  hasSaturdayClasses: boolean;
  lessonsPerDay?: number;
};

type UpdateCalendarEntryInput = {
  fiscalYear: string;
  calendarId: string;
  lessonsPerDay?: number;
  hasSaturdayClasses?: boolean;
};

export class CalendarConflictError extends Error {
  fiscalYear: string;

  constructor(message: string, fiscalYear: string) {
    super(message);
    this.name = 'CalendarConflictError';
    this.fiscalYear = fiscalYear;
  }
}

function isTemporaryNetworkError(error: unknown): error is FirebaseError {
  if (!(error instanceof FirebaseError)) {
    return false;
  }

  return error.code === 'unavailable' || error.code === 'deadline-exceeded';
}

function createInstalledEntries(
  entries: CalendarEntry[],
  input: InstallCalendarInput,
): CalendarEntry[] {
  const fiscalYear = input.fiscalYear.trim();
  const calendarId = input.calendarId.trim();
  const calendarName = input.calendarName.trim();
  const universityName = input.universityName.trim();
  const webId = input.webId.trim();
  const lessonsPerDay = sanitizeLessonsPerDay(input.lessonsPerDay);
  const hasSaturdayClasses = Boolean(input.hasSaturdayClasses);

  const nextEntries = entries
    .filter((entry) => entry.fiscalYear !== fiscalYear)
    .map((entry) => ({ ...entry, defaultFlag: false }));

  nextEntries.push({
    fiscalYear,
    calendarId,
    calendarName,
    universityName,
    webId,
    lessonsPerDay,
    hasSaturdayClasses,
    defaultFlag: true,
  });

  nextEntries.sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear));
  return nextEntries;
}

function updateEntryLocally(
  entries: CalendarEntry[],
  input: UpdateCalendarEntryInput,
): CalendarEntry[] {
  const fiscalYear = input.fiscalYear.trim();
  const calendarId = input.calendarId.trim();
  if (!fiscalYear || !calendarId) {
    return entries;
  }

  let updated = false;
  const nextEntries = entries.map((entry) => {
    if (entry.fiscalYear !== fiscalYear || entry.calendarId !== calendarId) {
      return entry;
    }

    updated = true;
    return {
      ...entry,
      ...(input.lessonsPerDay !== undefined
        ? { lessonsPerDay: sanitizeLessonsPerDay(input.lessonsPerDay) }
        : {}),
      ...(input.hasSaturdayClasses !== undefined
        ? { hasSaturdayClasses: Boolean(input.hasSaturdayClasses) }
        : {}),
    } satisfies CalendarEntry;
  });

  return updated ? nextEntries : entries;
}

function activateEntryLocally(
  entries: CalendarEntry[],
  fiscalYearInput: string,
  calendarIdInput: string,
): CalendarEntry[] {
  const fiscalYear = fiscalYearInput.trim();
  const calendarId = calendarIdInput.trim();
  if (!fiscalYear || !calendarId) {
    return entries;
  }

  let hasMatch = false;
  const nextEntries = entries.map((entry) => {
    if (entry.fiscalYear === fiscalYear && entry.calendarId === calendarId) {
      hasMatch = true;
      return { ...entry, defaultFlag: true } satisfies CalendarEntry;
    }
    return { ...entry, defaultFlag: false } satisfies CalendarEntry;
  });

  if (!hasMatch) {
    return entries;
  }

  nextEntries.sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear));
  return nextEntries;
}

type UserSettingsContextValue = {
  settings: UserSettings;
  initialized: boolean;
  installCalendar: (
    input: InstallCalendarInput,
    options?: { replaceExisting?: boolean },
  ) => Promise<void>;
  updateCalendarEntry: (input: UpdateCalendarEntryInput) => Promise<void>;
  setActiveCalendar: (fiscalYear: string, calendarId: string) => Promise<void>;
};

function parseCalendarEntries(calendarsField: unknown): CalendarEntry[] {
  if (!calendarsField || typeof calendarsField !== 'object') {
    return [];
  }

  const entries: CalendarEntry[] = [];
  const records = calendarsField as Record<string, unknown>;

  for (const [fiscalYearKey, rawValue] of Object.entries(records)) {
    if (!rawValue || typeof rawValue !== 'object') {
      continue;
    }

    const fiscalYear = fiscalYearKey.trim();
    const calendarId = normalizeString((rawValue as { calendarId?: unknown }).calendarId);
    if (!fiscalYear || !calendarId) {
      continue;
    }

    const calendarName = normalizeString((rawValue as { calendarName?: unknown }).calendarName);
    const universityName = normalizeString(
      (rawValue as { universityName?: unknown }).universityName,
    );
    const webId = normalizeString((rawValue as { webId?: unknown }).webId);
    const lessonsPerDay = sanitizeLessonsPerDay(
      (rawValue as { lessonsPerDay?: unknown }).lessonsPerDay,
    );
    const hasSaturdayClasses = normalizeBoolean(
      (rawValue as { hasSaturdayClasses?: unknown }).hasSaturdayClasses,
    );
    const defaultFlag = normalizeBoolean((rawValue as { defaultFlag?: unknown }).defaultFlag);

    entries.push({
      fiscalYear,
      calendarId,
      calendarName,
      universityName,
      webId,
      lessonsPerDay,
      hasSaturdayClasses,
      defaultFlag,
    });
  }

  entries.sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear));

  return entries;
}

function toUserSettings(entries: CalendarEntry[]): UserSettings {
  const activeEntry = entries.find((entry) => entry.defaultFlag) ?? entries[0] ?? null;

  if (!activeEntry) {
    return { calendar: { ...DEFAULT_CALENDAR_SETTINGS } } satisfies UserSettings;
  }

  return {
    calendar: {
      fiscalYear: activeEntry.fiscalYear,
      calendarId: activeEntry.calendarId,
      entries,
    },
  } satisfies UserSettings;
}

const UserSettingsContext = createContext<UserSettingsContextValue | undefined>(undefined);

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const { profile, initializing: authInitializing } = useAuth();
  const userId = profile?.uid ?? null;

  const [settings, setSettings] = useState<UserSettings>({ calendar: DEFAULT_CALENDAR_SETTINGS });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (authInitializing) {
      return;
    }

    if (!userId) {
      setSettings({ calendar: DEFAULT_CALENDAR_SETTINGS });
      setInitialized(true);
      return;
    }

    const userDocRef = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        const data = snapshot.data();
        const entries = parseCalendarEntries((data as { calendars?: unknown })?.calendars);
        setSettings(toUserSettings(entries));
        setInitialized(true);
      },
      (error) => {
        console.error('ユーザー設定の取得に失敗しました。', error);
        setSettings({ calendar: DEFAULT_CALENDAR_SETTINGS });
        setInitialized(true);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [authInitializing, userId]);

  const contextValue = useMemo<UserSettingsContextValue>(() => {
    async function ensureUserId(): Promise<string> {
      const resolvedUserId = userId ?? auth.currentUser?.uid ?? null;
      if (resolvedUserId) {
        return resolvedUserId;
      }

      if (typeof auth.authStateReady === 'function') {
        await auth.authStateReady();
        if (auth.currentUser?.uid) {
          return auth.currentUser.uid;
        }
      }

      throw new Error('ユーザーが認証されていません。');
    }

    async function installCalendar(
      input: InstallCalendarInput,
      options?: { replaceExisting?: boolean },
    ): Promise<void> {
      const fiscalYear = input.fiscalYear.trim();
      const calendarId = input.calendarId.trim();
      const calendarName = input.calendarName.trim();
      const universityName = input.universityName.trim();
      const webId = input.webId.trim();

      if (!fiscalYear || !calendarId || !calendarName || !universityName || !webId) {
        throw new Error('カレンダー情報が不足しています。');
      }

      const lessonsPerDay = sanitizeLessonsPerDay(input.lessonsPerDay);
      const hasSaturdayClasses = Boolean(input.hasSaturdayClasses);

      let uid: string | null = null;
      try {
        uid = await ensureUserId();
      } catch (error) {
        console.warn('ユーザー ID を取得できなかったためローカル設定へフォールバックします。', error);
      }

      const applyLocalInstall = () => {
        const existingEntry = settings.calendar.entries.find(
          (entry) => entry.fiscalYear === fiscalYear,
        );
        if (existingEntry && !options?.replaceExisting) {
          throw new CalendarConflictError(
            `${fiscalYear}年度のカレンダーが既に設定されています。`,
            fiscalYear,
          );
        }

        setSettings((prev) => ({
          calendar: {
            fiscalYear,
            calendarId,
            entries: createInstalledEntries(prev.calendar.entries, {
              fiscalYear,
              calendarId,
              calendarName,
              universityName,
              webId,
              hasSaturdayClasses,
              lessonsPerDay,
            }),
          },
        }));
      };

      if (!uid) {
        applyLocalInstall();
        return;
      }

      const userDocRef = doc(db, 'users', uid);

      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(userDocRef);
          const rawCalendars = snapshot.data()?.calendars;
          const existingCalendars =
            rawCalendars && typeof rawCalendars === 'object' ? { ...rawCalendars } : {};

          const currentEntry = existingCalendars[fiscalYear];
          if (currentEntry && !options?.replaceExisting) {
            throw new CalendarConflictError(
              `${fiscalYear}年度のカレンダーが既に設定されています。`,
              fiscalYear,
            );
          }

          const updatedCalendars: Record<string, unknown> = {};
          for (const [year, value] of Object.entries(existingCalendars)) {
            if (!value || typeof value !== 'object') {
              continue;
            }
            if (year === fiscalYear) {
              continue;
            }
            updatedCalendars[year] = {
              ...value,
              defaultFlag: false,
            };
          }

          updatedCalendars[fiscalYear] = {
            calendarId,
            calendarName,
            universityName,
            webId,
            lessonsPerDay,
            hasSaturdayClasses,
            defaultFlag: true,
          };

          transaction.set(
            userDocRef,
            {
              calendars: updatedCalendars,
            },
            { merge: true },
          );
        });
        return;
      } catch (error) {
        if (!isTemporaryNetworkError(error)) {
          throw error;
        }

        console.warn('Firestore に接続できないためローカル設定にフォールバックします。', error);
        applyLocalInstall();
      }
    }

    async function updateCalendarEntry(input: UpdateCalendarEntryInput): Promise<void> {
      const fiscalYear = input.fiscalYear.trim();
      const calendarId = input.calendarId.trim();
      if (!fiscalYear || !calendarId) {
        return;
      }

      let uid: string | null = null;
      try {
        uid = await ensureUserId();
      } catch (error) {
        console.warn('ユーザー ID を取得できなかったためローカル設定の更新にフォールバックします。', error);
      }

      const applyLocalUpdate = () => {
        setSettings((prev) => ({
          calendar: {
            fiscalYear: prev.calendar.fiscalYear,
            calendarId: prev.calendar.calendarId,
            entries: updateEntryLocally(prev.calendar.entries, input),
          },
        }));
      };

      if (!uid) {
        applyLocalUpdate();
        return;
      }

      const userDocRef = doc(db, 'users', uid);
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(userDocRef);
          const rawCalendars = snapshot.data()?.calendars;
          if (!rawCalendars || typeof rawCalendars !== 'object') {
            return;
          }

          const existingEntry = rawCalendars[fiscalYear];
          if (!existingEntry || typeof existingEntry !== 'object') {
            return;
          }

          const storedCalendarId = normalizeString(
            (existingEntry as { calendarId?: unknown }).calendarId,
          );
          if (storedCalendarId !== calendarId) {
            return;
          }

          const nextEntry = {
            ...existingEntry,
            ...(input.lessonsPerDay !== undefined
              ? { lessonsPerDay: sanitizeLessonsPerDay(input.lessonsPerDay) }
              : {}),
            ...(input.hasSaturdayClasses !== undefined
              ? { hasSaturdayClasses: Boolean(input.hasSaturdayClasses) }
              : {}),
          };

          const updatedCalendars: Record<string, unknown> = {
            ...rawCalendars,
            [fiscalYear]: nextEntry,
          };

          transaction.set(
            userDocRef,
            {
              calendars: updatedCalendars,
            },
            { merge: true },
          );
        });
      } catch (error) {
        if (!isTemporaryNetworkError(error)) {
          throw error;
        }

        console.warn('Firestore に接続できないためローカル設定を更新します。', error);
        applyLocalUpdate();
      }
    }

    async function setActiveCalendar(
      fiscalYearInput: string,
      calendarIdInput: string,
    ): Promise<void> {
      const fiscalYear = fiscalYearInput.trim();
      const calendarId = calendarIdInput.trim();
      if (!fiscalYear || !calendarId) {
        return;
      }

      let uid: string | null = null;
      try {
        uid = await ensureUserId();
      } catch (error) {
        console.warn('ユーザー ID を取得できないためローカルで既定カレンダーを切り替えます。', error);
      }

      const applyLocalActivation = () => {
        setSettings((prev) => {
          const nextEntries = activateEntryLocally(prev.calendar.entries, fiscalYear, calendarId);

          if (nextEntries === prev.calendar.entries) {
            return prev;
          }

          return {
            calendar: {
              fiscalYear,
              calendarId,
              entries: nextEntries,
            },
          } satisfies UserSettings;
        });
      };

      if (!uid) {
        applyLocalActivation();
        return;
      }

      const userDocRef = doc(db, 'users', uid);
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(userDocRef);
          const rawCalendars = snapshot.data()?.calendars;
          if (!rawCalendars || typeof rawCalendars !== 'object') {
            return;
          }

          const updatedCalendars: Record<string, unknown> = {};

          for (const [year, value] of Object.entries(rawCalendars)) {
            if (!value || typeof value !== 'object') {
              continue;
            }

            const storedCalendarId = normalizeString(
              (value as { calendarId?: unknown }).calendarId,
            );
            updatedCalendars[year] = {
              ...value,
              defaultFlag: year === fiscalYear && storedCalendarId === calendarId,
            };
          }

          transaction.set(
            userDocRef,
            {
              calendars: updatedCalendars,
            },
            { merge: true },
          );
        });
      } catch (error) {
        if (!isTemporaryNetworkError(error)) {
          throw error;
        }

        console.warn('Firestore に接続できないためローカルで既定カレンダーを切り替えます。', error);
        applyLocalActivation();
      }
    }

    return {
      settings,
      initialized,
      installCalendar,
      updateCalendarEntry,
      setActiveCalendar,
    } satisfies UserSettingsContextValue;
  }, [initialized, settings, userId]);

  return <UserSettingsContext.Provider value={contextValue}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error('useUserSettings は UserSettingsProvider 内で使用してください。');
  }
  return context;
}

export { DEFAULT_CALENDAR_SETTINGS };
