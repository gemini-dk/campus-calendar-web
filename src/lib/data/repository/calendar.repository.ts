import { collection, getDocs, orderBy, query } from 'firebase/firestore';

import { db } from '@/lib/firebase/client';

import {
  calendarDaySchema,
  calendarTermSchema,
  type CalendarDay,
  type CalendarTerm,
} from '../schema/calendar';

const CALENDAR_COLLECTION_PREFIX = 'calendars_';

function getCalendarPathSegments(fiscalYear: string, calendarId: string) {
  return [`${CALENDAR_COLLECTION_PREFIX}${fiscalYear}`, calendarId] as const;
}

function coerceTermData(data: unknown): CalendarTerm {
  const record = typeof data === 'object' && data !== null ? data : {};
  const order =
    (record as { order?: number | null }).order ??
    (record as { termOrder?: number | null }).termOrder ??
    undefined;
  const candidate = {
    ...record,
    name: (record as { name?: string; termName?: string }).name
      ?? (record as { termName?: string }).termName
      ?? '',
    order,
  };

  return calendarTermSchema.parse(candidate);
}

export async function listCalendarTerms(
  fiscalYear: string,
  calendarId: string,
): Promise<CalendarTerm[]> {
  const segments = getCalendarPathSegments(fiscalYear, calendarId);
  const termsRef = collection(db, ...segments, 'calendar_terms');
  const snapshot = await getDocs(query(termsRef, orderBy('order', 'asc')));

  return snapshot.docs
    .map((doc) =>
      coerceTermData({
        id: doc.id,
        ...doc.data(),
      }),
    )
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
}

export async function listCalendarDays(
  fiscalYear: string,
  calendarId: string,
): Promise<CalendarDay[]> {
  const segments = getCalendarPathSegments(fiscalYear, calendarId);
  const daysRef = collection(db, ...segments, 'calendar_days');
  const snapshot = await getDocs(query(daysRef, orderBy('date', 'asc')));

  return snapshot.docs
    .map((doc) =>
      calendarDaySchema.parse({
        id: doc.id,
        ...doc.data(),
      }),
    )
    .sort((a, b) => {
      const dateA = a.date ?? '';
      const dateB = b.date ?? '';
      return dateA.localeCompare(dateB);
    });
}
