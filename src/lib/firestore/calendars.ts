'use client';

import { collection, doc, getDoc, getDocs, type DocumentData, type Firestore } from 'firebase/firestore';

export type CalendarDayType = 'class_day' | 'holiday' | 'exam';

export type CalendarSummary = {
  name: string | null;
  fiscalYear: number | null;
  fiscalStart: string | null;
  fiscalEnd: string | null;
};

export type CalendarTerm = {
  id: string;
  name: string;
  shortName: string | null;
  order: number | null;
  classCount: number | null;
  holidayFlag: 1 | 2 | null;
};

export type CalendarDay = {
  id: string;
  date: string;
  dayOfWeek: number;
  termId: string | null;
  termName: string | null;
  type: CalendarDayType | string;
};

export type CalendarData = {
  summary: CalendarSummary | null;
  terms: CalendarTerm[];
  days: CalendarDay[];
};

const CLASS_DAY_KEYWORDS = ['授業', 'class', '試験'];

export const isClassDayType = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  const lower = value.toLowerCase();
  if (lower === 'class_day') {
    return true;
  }
  return CLASS_DAY_KEYWORDS.some((keyword) => lower.includes(keyword));
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Number.isFinite(value) ? value : null;
};

const extractTermId = (data: DocumentData): string | null => {
  const raw = data.termId ?? data.term_id;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (raw && typeof raw === 'object') {
    const refId = 'id' in raw && typeof raw.id === 'string' ? raw.id.trim() : null;
    if (refId) {
      return refId;
    }
    if ('path' in raw && typeof raw.path === 'string') {
      const segments = raw.path.split('/');
      const last = segments[segments.length - 1];
      return last && last.length > 0 ? last : null;
    }
  }
  return null;
};

const toMondayBasedWeekday = (jsWeekday: number): number => (jsWeekday === 0 ? 7 : jsWeekday);

const deriveWeekdayFromDate = (dateIso: string): number => {
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(timestamp)) {
    return 1;
  }
  const date = new Date(timestamp);
  return toMondayBasedWeekday(date.getUTCDay());
};

const parseCalendarSummary = (data: DocumentData): CalendarSummary => ({
  name: normalizeString(data.name) ?? null,
  fiscalYear: normalizeNumber(data.fiscalYear ?? data.fiscal_year) ?? null,
  fiscalStart: normalizeString(data.fiscalStart ?? data.fiscal_start) ?? null,
  fiscalEnd: normalizeString(data.fiscalEnd ?? data.fiscal_end) ?? null,
});

const parseCalendarTerm = (id: string, data: DocumentData): CalendarTerm | null => {
  const name = normalizeString(data.name ?? data.termName);
  if (!name) {
    return null;
  }
  const shortName = normalizeString(data.shortName ?? data.short_name);
  const orderValue = normalizeNumber(data.order ?? data.termOrder);
  const classCountValue = normalizeNumber(data.classCount ?? data.class_count);
  const holidayFlagValue = normalizeNumber(data.holidayFlag ?? data.holiday_flag);

  let holidayFlag: 1 | 2 | null = null;
  if (holidayFlagValue === 1 || holidayFlagValue === 2) {
    holidayFlag = holidayFlagValue;
  }

  return {
    id,
    name,
    shortName: shortName ?? null,
    order: orderValue !== null ? Math.trunc(orderValue) : null,
    classCount: classCountValue !== null ? Math.trunc(classCountValue) : null,
    holidayFlag,
  } satisfies CalendarTerm;
};

const parseCalendarDay = (id: string, data: DocumentData): CalendarDay | null => {
  const date = normalizeString(data.date);
  if (!date) {
    return null;
  }
  const type = normalizeString(data.type) ?? '未指定';
  const classWeekday = normalizeNumber(data.classWeekday ?? data.class_weekday);
  const termId = extractTermId(data);
  const termName = normalizeString(data.termName ?? data.term_name);

  const dayOfWeek = classWeekday !== null ? Math.min(Math.max(Math.trunc(classWeekday), 1), 7) : deriveWeekdayFromDate(date);

  return {
    id,
    date,
    dayOfWeek,
    termId,
    termName: termName ?? null,
    type,
  } satisfies CalendarDay;
};

export async function fetchCalendarData({
  db,
  uid,
  calendarId,
  fiscalYear,
}: {
  db: Firestore;
  uid: string;
  calendarId: string;
  fiscalYear?: number | null;
}): Promise<CalendarData> {
  const calendarRef = doc(db, 'users', uid, 'calendars', calendarId);
  const [calendarSnap, termSnap, daySnap] = await Promise.all([
    getDoc(calendarRef),
    getDocs(collection(calendarRef, 'terms')),
    getDocs(collection(calendarRef, 'days')),
  ]);

  const summary = calendarSnap.exists() ? parseCalendarSummary(calendarSnap.data() as DocumentData) : null;

  const terms: CalendarTerm[] = [];
  termSnap.forEach((termDoc) => {
    const parsed = parseCalendarTerm(termDoc.id, termDoc.data());
    if (parsed) {
      terms.push(parsed);
    }
  });
  terms.sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.name.localeCompare(b.name, 'ja');
  });

  const days: CalendarDay[] = [];
  daySnap.forEach((dayDoc) => {
    const parsed = parseCalendarDay(dayDoc.id, dayDoc.data());
    if (parsed) {
      days.push(parsed);
    }
  });
  days.sort((a, b) => a.date.localeCompare(b.date));

  let filteredDays = days;
  if (typeof fiscalYear === 'number' && Number.isFinite(fiscalYear)) {
    const rangeStart = `${fiscalYear}-04-01`;
    const rangeEnd = `${fiscalYear + 1}-03-31`;
    filteredDays = days.filter((day) => day.date >= rangeStart && day.date <= rangeEnd);
  }

  return {
    summary,
    terms,
    days: filteredDays,
  };
}
