import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

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
  const holidayFlag = (record as { holidayFlag?: number | null }).holidayFlag ?? undefined;
  const candidate = {
    ...record,
    name: (record as { name?: string; termName?: string }).name
      ?? (record as { termName?: string }).termName
      ?? '',
    holidayFlag,
    order,
  };

  return calendarTermSchema.parse(candidate);
}

function coerceDayData(data: unknown): CalendarDay {
  const candidate = calendarDaySchema.parse(data);
  if (typeof candidate.classWeekday === 'number' && Number.isFinite(candidate.classWeekday)) {
    return candidate;
  }
  if (!candidate.date) {
    return candidate;
  }
  if (candidate.type !== '授業日') {
    return candidate;
  }
  const parsed = new Date(`${candidate.date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return candidate;
  }
  const weekday = ((parsed.getDay() + 6) % 7) + 1;
  return {
    ...candidate,
    classWeekday: weekday,
  };
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
      coerceDayData({
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

export async function getCalendarDay(
  fiscalYear: string,
  calendarId: string,
  dateId: string,
): Promise<CalendarDay | null> {
  const segments = getCalendarPathSegments(fiscalYear, calendarId);
  const daysRef = collection(db, ...segments, 'calendar_days');

  const dateQuery = query(daysRef, where('date', '==', dateId), limit(1));
  const dateSnapshot = await getDocs(dateQuery);

  if (!dateSnapshot.empty) {
    const docSnap = dateSnapshot.docs[0];
    return coerceDayData({
      id: docSnap.id,
      ...docSnap.data(),
    });
  }

  // Fallback: Firestore 上でドキュメント ID を直接指定しているケースに対応
  const ref = doc(db, ...segments, 'calendar_days', dateId);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    return coerceDayData({
      id: snapshot.id,
      ...snapshot.data(),
    });
  }

  const normalizedId = dateId.replaceAll('-', '');
  const normalizedRef = doc(db, ...segments, 'calendar_days', normalizedId);
  const normalizedSnapshot = await getDoc(normalizedRef);
  if (normalizedSnapshot.exists()) {
    return coerceDayData({
      id: normalizedSnapshot.id,
      ...normalizedSnapshot.data(),
    });
  }

  return null;
}
