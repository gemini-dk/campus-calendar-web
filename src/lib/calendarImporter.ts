'use client';

import { serverTimestamp, writeBatch, doc, type Firestore } from 'firebase/firestore';
import type { ConvexHttpClient } from 'convex/browser';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import { convexApi, getConvexClient } from './convexClient';
import { db } from './firebase';

type CalendarId = Id<'calendars'>;
type CalendarTermId = Id<'calendar_terms'>;

type ConvexCalendarTerm = {
  _id: CalendarTermId;
  termName: string;
  order?: number;
  shortName?: string;
  classCount?: number;
  holidayFlag?: boolean;
};

type ConvexCalendarDay = Doc<'calendar_days'>;

type ConvexCalendarDetail = {
  calendar: Doc<'calendars'>;
  days: ConvexCalendarDay[];
  terms: ConvexCalendarTerm[];
  campuses: Array<{
    campusName: string;
    officeCode?: string;
    officeName?: string;
    class10Code?: string;
    class10Name?: string;
  }>;
};

type UniversitySearchRow = {
  _id: Id<'universities'>;
  code: string;
  name: string;
  prefecture?: string;
  type?: string;
  capacity?: number;
};

type CalendarSearchRow = {
  _id: CalendarId;
  name: string;
  fiscalYear: number;
  universityCode?: string;
  updatedAt: number;
  downloadCount: number;
  creatorId?: string;
  universityName: string;
  isPublishable: boolean;
  memoPreview?: string;
  allCampusesHaveOfficeCode: boolean;
};

export type UniversitySearchResult = {
  universityId: Id<'universities'>;
  code: string;
  name: string;
  prefecture?: string;
  type?: string;
  capacity?: number;
};

export type CalendarSearchResult = {
  calendarId: CalendarId;
  name: string;
  fiscalYear: number;
  universityCode?: string;
  universityName: string;
  downloadCount: number;
  updatedAt: number;
  isPublishable: boolean;
  memoPreview?: string;
  allCampusesHaveOfficeCode: boolean;
};

export type CalendarImportSummary = {
  calendarId: CalendarId;
  calendarName: string;
  dayCount: number;
  termCount: number;
  campusCount: number;
};

type ImportOptions = {
  userId: string;
  calendarId: CalendarId;
  firestore?: Firestore;
  convexClient?: ConvexHttpClient;
};

export async function searchUniversitiesByName(keyword: string, limit = 20): Promise<UniversitySearchResult[]> {
  const convex = getConvexClient();
  const trimmed = keyword.trim();
  if (!trimmed) {
    return [];
  }
  const rows = (await convex.query(convexApi.universities.searchByName, {
    q: trimmed,
    limit,
  })) as UniversitySearchRow[];

  return rows.map((row) => ({
    universityId: row._id,
    code: row.code,
    name: row.name,
    prefecture: row.prefecture ?? undefined,
    type: row.type ?? undefined,
    capacity: typeof row.capacity === 'number' ? row.capacity : undefined,
  }));
}

export async function searchCalendarsByUniversity(
  keyword: string,
  fiscalYear: number,
  options?: { limit?: number; includeUnpublishable?: boolean }
): Promise<CalendarSearchResult[]> {
  const convex = getConvexClient();
  const trimmed = keyword.trim();
  const limit = options?.limit;
  const includeUnpublishable = options?.includeUnpublishable;
  const rows = (await convex.query(convexApi.calendars.searchCalendarsByUniversityName, {
    q: trimmed,
    fiscalYear,
    limit,
    includeUnpublishable,
  })) as CalendarSearchRow[];

  return rows.map((row) => ({
    calendarId: row._id,
    name: row.name,
    fiscalYear: row.fiscalYear,
    universityCode: row.universityCode ?? undefined,
    universityName: row.universityName,
    downloadCount: toFiniteNumber(row.downloadCount) ?? 0,
    updatedAt: row.updatedAt,
    isPublishable: row.isPublishable,
    memoPreview: row.memoPreview ?? undefined,
    allCampusesHaveOfficeCode: row.allCampusesHaveOfficeCode,
  }));
}

export async function importCalendarToFirestore({
  userId,
  calendarId,
  firestore,
  convexClient,
}: ImportOptions): Promise<CalendarImportSummary> {
  const convex = convexClient ?? getConvexClient();
  const store = firestore ?? db;

  const detail = (await convex.action(convexApi.calendars.getCalendarWithTracking, {
    calendarId,
  })) as ConvexCalendarDetail | null;

  if (!detail) {
    throw new Error('指定されたカレンダーが Convex に存在しません。');
  }

  const { calendar, days, terms, campuses } = detail;

  const calendarDocRef = doc(store, 'users', userId, 'calendars', calendar._id);
  const batch = writeBatch(store);

  const calendarRecord = cleanUndefined({
    calendarId: calendar._id,
    name: calendar.name,
    fiscalYear: calendar.fiscalYear,
    fiscalStart: calendar.fiscalStart,
    fiscalEnd: calendar.fiscalEnd,
    universityCode: optionalTrimmedString(calendar.universityCode),
    disableSaturday: calendar.disableSaturday === true,
    downloadCount: toFiniteNumber(calendar.downloadCount) ?? 0,
    creatorId: optionalTrimmedString(calendar.creatorId),
    syncedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(calendarDocRef, calendarRecord, { merge: true });

  const termNameMap = new Map<CalendarTermId, string>();
  terms.forEach((term) => {
    termNameMap.set(term._id, term.termName);
    const termDocRef = doc(store, 'users', userId, 'calendars', calendar._id, 'terms', term._id);
    const termRecord = cleanUndefined({
      termName: term.termName,
      termOrder: toFiniteNumber(term.order) ?? null,
      shortName: term.shortName ?? null,
      classCount: toFiniteNumber(term.classCount) ?? null,
      isHoliday: term.holidayFlag === true,
      updatedAt: serverTimestamp(),
    });
    batch.set(termDocRef, termRecord, { merge: true });
  });

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  sortedDays.forEach((day) => {
    const termName = day.termId ? termNameMap.get(day.termId) ?? null : null;
    const dayDocRef = doc(store, 'users', userId, 'calendars', calendar._id, 'days', day.date);
    const dayRecord = cleanUndefined({
      date: day.date,
      type: day.type,
      termId: day.termId ?? null,
      termName,
      description: optionalTrimmedString(day.description) ?? null,
      isHoliday: typeof day.isHoliday === 'boolean' ? day.isHoliday : undefined,
      nationalHolidayName: optionalTrimmedString(day.nationalHolidayName) ?? null,
      classWeekday: resolveClassWeekday(day.classWeekday, day.date),
      classOrder: toFiniteNumber(day.classOrder) ?? null,
      notificationReasons: parseNotificationReasons(day.notificationReasons),
      isDeleted: false,
      updatedAt: serverTimestamp(),
    });
    batch.set(dayDocRef, dayRecord, { merge: true });
  });

  const campusMap = new Map<string, (typeof campuses)[number]>();
  campuses.forEach((campus) => {
    const name = optionalTrimmedString(campus.campusName);
    if (!name) {
      return;
    }
    if (!campusMap.has(name)) {
      campusMap.set(name, campus);
    }
  });

  campusMap.forEach((campus, name) => {
    const campusDocRef = doc(
      store,
      'users',
      userId,
      'calendars',
      calendar._id,
      'campuses',
      toFirestoreId(name)
    );
    const campusRecord = cleanUndefined({
      campusName: name,
      officeCode: optionalTrimmedString(campus.officeCode) ?? null,
      officeName: optionalTrimmedString(campus.officeName) ?? null,
      class10Code: optionalTrimmedString(campus.class10Code) ?? null,
      class10Name: optionalTrimmedString(campus.class10Name) ?? null,
      updatedAt: serverTimestamp(),
    });
    batch.set(campusDocRef, campusRecord, { merge: true });
  });

  await batch.commit();

  return {
    calendarId: calendar._id,
    calendarName: calendar.name,
    dayCount: sortedDays.length,
    termCount: terms.length,
    campusCount: campusMap.size,
  };
}

function parseNotificationReasons(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function resolveClassWeekday(weekday: unknown, dateIso: string): number {
  if (typeof weekday === 'number' && Number.isFinite(weekday) && weekday >= 1 && weekday <= 7) {
    return Math.trunc(weekday);
  }
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(timestamp)) {
    return 1;
  }
  const jsDate = new Date(timestamp);
  const jsWeekday = jsDate.getUTCDay();
  return jsWeekday === 0 ? 7 : jsWeekday;
}

function toFirestoreId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'default';
  }
  return trimmed.replace(/[\/#?\[\]]/g, '-');
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanUndefined<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}
