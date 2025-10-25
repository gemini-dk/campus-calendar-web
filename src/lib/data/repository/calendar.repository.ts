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

import { db } from '@/lib/firebase/firestore';

import {
  calendarDaySchema,
  calendarTermSchema,
  type CalendarDay,
  type CalendarTerm,
} from '../schema/calendar';

const CALENDAR_COLLECTION_PREFIX = 'calendars_';

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getCalendarPathSegments(fiscalYear: string, calendarId: string) {
  return [`${CALENDAR_COLLECTION_PREFIX}${fiscalYear}`, calendarId] as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildCalendarDay(id: string, record: Record<string, unknown>): CalendarDay {
  const dateValue = typeof record.date === 'string' ? record.date : undefined;
  return coerceDayData({
    id,
    ...record,
    date: dateValue ?? id,
  });
}

function toIsoDateString(dateId: string): string | null {
  if (DAY_KEY_PATTERN.test(dateId)) {
    return dateId;
  }
  const normalized = dateId.replaceAll('-', '');
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6)}`;
  }
  return null;
}

function toMonthIdFromDateId(dateId: string): string | null {
  const iso = toIsoDateString(dateId);
  if (iso) {
    return iso.slice(0, 7);
  }
  const normalized = dateId.replaceAll('-', '');
  if (/^\d{6}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}`;
  }
  return null;
}

function findCalendarDayInMonthData(
  data: unknown,
  keysToMatch: Set<string>,
): CalendarDay | null {
  if (!isRecord(data)) {
    return null;
  }

  for (const [key, value] of Object.entries(data)) {
    if (!isRecord(value)) {
      continue;
    }

    const normalizedKey = key.replaceAll('-', '');
    if (keysToMatch.has(key) || keysToMatch.has(normalizedKey)) {
      return buildCalendarDay(key, value);
    }

    const dateValue = typeof value.date === 'string' ? value.date : undefined;
    if (dateValue) {
      const normalizedDateValue = dateValue.replaceAll('-', '');
      if (keysToMatch.has(dateValue) || keysToMatch.has(normalizedDateValue)) {
        return buildCalendarDay(key, value);
      }
    }

    const idValue = typeof value.id === 'string' ? value.id : undefined;
    if (idValue) {
      const normalizedIdValue = idValue.replaceAll('-', '');
      if (keysToMatch.has(idValue) || keysToMatch.has(normalizedIdValue)) {
        return buildCalendarDay(key, value);
      }
    }
  }

  return null;
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
  const snapshot = await getDocs(daysRef);

  const days = snapshot.docs.flatMap((docSnap) => {
    const data = docSnap.data();
    if (!isRecord(data)) {
      return [] as CalendarDay[];
    }

    if (DAY_KEY_PATTERN.test(docSnap.id)) {
      return [buildCalendarDay(docSnap.id, data)];
    }

    return Object.entries(data)
      .filter((entry): entry is [string, Record<string, unknown>] => {
        const [key, value] = entry;
        return DAY_KEY_PATTERN.test(key) && isRecord(value);
      })
      .map(([key, value]) => buildCalendarDay(key, value));
  });

  return days.sort((a, b) => {
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

  const isoDate = toIsoDateString(dateId);
  const normalizedDate = (isoDate ?? dateId).replaceAll('-', '');
  const monthId = toMonthIdFromDateId(dateId);
  const keysToMatch = new Set<string>([dateId, normalizedDate]);
  if (isoDate) {
    keysToMatch.add(isoDate);
    keysToMatch.add(isoDate.replaceAll('-', ''));
  }

  if (monthId) {
    const monthRef = doc(db, ...segments, 'calendar_days', monthId);
    const monthSnapshot = await getDoc(monthRef);
    if (monthSnapshot.exists()) {
      const matched = findCalendarDayInMonthData(monthSnapshot.data(), keysToMatch);
      if (matched) {
        return matched;
      }
    }
  }

  const dateToQuery = isoDate ?? dateId;
  const dateQuery = query(daysRef, where('date', '==', dateToQuery), limit(1));
  const dateSnapshot = await getDocs(dateQuery);

  if (!dateSnapshot.empty) {
    const docSnap = dateSnapshot.docs[0];
    const data = docSnap.data();
    if (isRecord(data)) {
      return buildCalendarDay(docSnap.id, data);
    }
  }

  // Fallback: Firestore 上でドキュメント ID を直接指定しているケースに対応
  const ref = doc(db, ...segments, 'calendar_days', dateId);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    const data = snapshot.data();
    if (isRecord(data)) {
      return buildCalendarDay(snapshot.id, data);
    }
  }

  const normalizedId = dateId.replaceAll('-', '');
  const normalizedRef = doc(db, ...segments, 'calendar_days', normalizedId);
  const normalizedSnapshot = await getDoc(normalizedRef);
  if (normalizedSnapshot.exists()) {
    const data = normalizedSnapshot.data();
    if (isRecord(data)) {
      return buildCalendarDay(normalizedSnapshot.id, data);
    }
  }

  return null;
}
