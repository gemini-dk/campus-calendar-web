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

const LOCAL_STORAGE_KEY_PREFIX = 'ccw:calendar_data:';
const LOCAL_STORAGE_VERSION = 1;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CalendarDataBundle = {
  days: CalendarDay[];
  terms: CalendarTerm[];
};

type StoredCalendarData = CalendarDataBundle & {
  version: number;
  fiscalYear: string;
  calendarId: string;
  fetchedAt: number;
};

const pendingBundleRequests = new Map<string, Promise<CalendarDataBundle>>();

function getCalendarPathSegments(fiscalYear: string, calendarId: string) {
  return [`${CALENDAR_COLLECTION_PREFIX}${fiscalYear}`, calendarId] as const;
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('localStorage へアクセスできませんでした。', error);
    return null;
  }
}

function getStorageKey(fiscalYear: string, calendarId: string): string {
  return `${LOCAL_STORAGE_KEY_PREFIX}${fiscalYear}::${calendarId}`;
}

function sanitizeCalendarTerm(term: CalendarTerm): CalendarTerm {
  const sanitized = { ...term } as CalendarTerm & Record<string, unknown>;
  delete sanitized.updatedAt;
  return sanitized;
}

function sanitizeCalendarDay(day: CalendarDay): CalendarDay {
  const sanitized = { ...day } as CalendarDay & Record<string, unknown>;
  delete sanitized.updatedAt;
  delete sanitized.syncedAt;
  return sanitized;
}

function saveCalendarDataToStorage(
  storage: Storage,
  fiscalYear: string,
  calendarId: string,
  bundle: CalendarDataBundle,
) {
  const key = getStorageKey(fiscalYear, calendarId);
  try {
    const record: StoredCalendarData = {
      version: LOCAL_STORAGE_VERSION,
      fiscalYear,
      calendarId,
      fetchedAt: Date.now(),
      terms: bundle.terms.map(sanitizeCalendarTerm),
      days: bundle.days.map(sanitizeCalendarDay),
    };
    storage.setItem(key, JSON.stringify(record));
  } catch (error) {
    console.warn('学事カレンダーのキャッシュ保存に失敗しました。', error);
  }
}

function loadCalendarDataFromStorage(
  storage: Storage,
  fiscalYear: string,
  calendarId: string,
): CalendarDataBundle | null {
  const key = getStorageKey(fiscalYear, calendarId);
  const rawValue = storage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredCalendarData>;
    if (parsed.version !== LOCAL_STORAGE_VERSION) {
      storage.removeItem(key);
      return null;
    }
    if (parsed.fiscalYear !== fiscalYear || parsed.calendarId !== calendarId) {
      storage.removeItem(key);
      return null;
    }
    if (!Array.isArray(parsed.days) || !Array.isArray(parsed.terms)) {
      storage.removeItem(key);
      return null;
    }
    return {
      days: parsed.days as CalendarDay[],
      terms: parsed.terms as CalendarTerm[],
    } satisfies CalendarDataBundle;
  } catch (error) {
    console.warn('学事カレンダーのキャッシュ読み込みに失敗しました。', error);
    storage.removeItem(key);
    return null;
  }
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

function findCalendarDayInList(
  days: CalendarDay[],
  keysToMatch: Set<string>,
): CalendarDay | null {
  for (const day of days) {
    const normalizedId = day.id.replaceAll('-', '');
    if (keysToMatch.has(day.id) || keysToMatch.has(normalizedId)) {
      return day;
    }

    if (day.date) {
      const normalizedDate = day.date.replaceAll('-', '');
      if (keysToMatch.has(day.date) || keysToMatch.has(normalizedDate)) {
        return day;
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

async function fetchCalendarTermsFromFirestore(
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

async function fetchCalendarDaysFromFirestore(
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

async function fetchCalendarDataBundle(
  fiscalYear: string,
  calendarId: string,
): Promise<CalendarDataBundle> {
  const [terms, days] = await Promise.all([
    fetchCalendarTermsFromFirestore(fiscalYear, calendarId),
    fetchCalendarDaysFromFirestore(fiscalYear, calendarId),
  ]);

  return { terms, days } satisfies CalendarDataBundle;
}

async function getCalendarDataBundle(
  fiscalYear: string,
  calendarId: string,
): Promise<CalendarDataBundle> {
  const storage = getLocalStorage();
  if (storage) {
    const cached = loadCalendarDataFromStorage(storage, fiscalYear, calendarId);
    if (cached) {
      return cached;
    }
  }

  const key = getStorageKey(fiscalYear, calendarId);
  const pending = pendingBundleRequests.get(key);
  if (pending) {
    return pending;
  }

  const request = fetchCalendarDataBundle(fiscalYear, calendarId)
    .then((bundle) => {
      if (storage) {
        saveCalendarDataToStorage(storage, fiscalYear, calendarId, bundle);
      }
      return bundle;
    })
    .finally(() => {
      pendingBundleRequests.delete(key);
    });

  pendingBundleRequests.set(key, request);
  return request;
}

export async function listCalendarTerms(
  fiscalYear: string,
  calendarId: string,
): Promise<CalendarTerm[]> {
  const bundle = await getCalendarDataBundle(fiscalYear, calendarId);
  return bundle.terms;
}

export async function listCalendarDays(
  fiscalYear: string,
  calendarId: string,
): Promise<CalendarDay[]> {
  const bundle = await getCalendarDataBundle(fiscalYear, calendarId);
  return bundle.days;
}

export async function ensureCalendarDataCached(
  fiscalYear: string,
  calendarId: string,
): Promise<void> {
  await getCalendarDataBundle(fiscalYear, calendarId);
}

export async function getCalendarDay(
  fiscalYear: string,
  calendarId: string,
  dateId: string,
): Promise<CalendarDay | null> {
  const isoDate = toIsoDateString(dateId);
  const normalizedDate = (isoDate ?? dateId).replaceAll('-', '');
  const monthId = toMonthIdFromDateId(dateId);
  const keysToMatch = new Set<string>([dateId, normalizedDate]);
  if (isoDate) {
    keysToMatch.add(isoDate);
    keysToMatch.add(isoDate.replaceAll('-', ''));
  }

  try {
    const bundle = await getCalendarDataBundle(fiscalYear, calendarId);
    const cached = findCalendarDayInList(bundle.days, keysToMatch);
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.warn('学事カレンダーのローカルキャッシュからの取得に失敗しました。', error);
  }

  const segments = getCalendarPathSegments(fiscalYear, calendarId);
  const daysRef = collection(db, ...segments, 'calendar_days');

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
