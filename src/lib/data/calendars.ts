'use client';

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

export type FirestoreCalendarSummary = {
  _id: string;
  name: string;
  fiscalYear?: number;
  fiscalStart?: string;
  fiscalEnd?: string;
  syncedAt?: string;
};

export type FirestoreCalendarTerm = {
  _id: string;
  termName: string;
  shortName?: string;
  order?: number;
  classCount?: number;
  holidayFlag?: boolean;
};

export type FirestoreCalendarDay = {
  _id: string;
  date: string;
  type: '未指定' | '授業日' | '試験日' | '予備日' | '休講日';
  termId?: string;
  termName?: string;
  termShortName?: string;
  classWeekday?: number;
  classOrder?: number;
};

export type FirestoreCalendarDetails = {
  calendar: FirestoreCalendarSummary;
  terms: FirestoreCalendarTerm[];
  days: FirestoreCalendarDay[];
};

type DayType = FirestoreCalendarDay['type'];

const DAY_TYPE_MAPPINGS: Array<{ keywords: string[]; type: DayType }> = [
  { keywords: ['class', '授業'], type: '授業日' },
  { keywords: ['exam', '試験', 'test'], type: '試験日' },
  { keywords: ['reserve', 'makeup', '補講', '予備'], type: '予備日' },
  { keywords: ['holiday', '休講', 'closed'], type: '休講日' },
];

export async function fetchCalendarDetails({
  userId,
  calendarId,
}: {
  userId: string;
  calendarId: string;
}): Promise<FirestoreCalendarDetails> {
  if (!userId || !calendarId) {
    throw new Error('カレンダーを取得するにはユーザー ID とカレンダー ID が必要です。');
  }

  const calendarRef = doc(db, 'users', userId, 'calendars', calendarId);
  const [summarySnap, termsSnap, daysSnap] = await Promise.all([
    getDoc(calendarRef),
    getDocs(query(collection(calendarRef, 'terms'), orderBy('termOrder', 'asc'))),
    getDocs(collection(calendarRef, 'days')),
  ]);

  if (!summarySnap.exists()) {
    throw new Error('指定されたカレンダーは Firestore に存在しません。');
  }

  const calendar = mapCalendarSummary(summarySnap.id, summarySnap.data());
  const terms = termsSnap.docs.map(mapCalendarTerm).sort((a, b) => {
    if (a.order === undefined && b.order === undefined) {
      return a.termName.localeCompare(b.termName);
    }
    if (a.order === undefined) {
      return 1;
    }
    if (b.order === undefined) {
      return -1;
    }
    if (a.order === b.order) {
      return a.termName.localeCompare(b.termName);
    }
    return a.order - b.order;
  });

  const days = daysSnap.docs
    .map(mapCalendarDay)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { calendar, terms, days };
}

function mapCalendarSummary(id: string, data: DocumentData): FirestoreCalendarSummary {
  const name = readString(data, ['name', 'title']) ?? id;
  const fiscalYear = readNumber(data, ['fiscalYear', 'fiscal_year']);
  const fiscalStart = readDateString(data, ['fiscalStart', 'fiscal_start', 'startDate', 'start_date']);
  const fiscalEnd = readDateString(data, ['fiscalEnd', 'fiscal_end', 'endDate', 'end_date']);
  const syncedAt = readDateTimeString(data, ['syncedAt', 'synced_at', 'updatedAt', 'updated_at']);

  return {
    _id: id,
    name,
    fiscalYear,
    fiscalStart,
    fiscalEnd,
    syncedAt,
  } satisfies FirestoreCalendarSummary;
}

function mapCalendarTerm(snapshot: QueryDocumentSnapshot<DocumentData>): FirestoreCalendarTerm {
  const data = snapshot.data();
  const termName =
    readString(data, ['termName', 'name', 'term_name']) ?? snapshot.id ?? '未設定の学期';
  const shortName = readString(data, ['shortName', 'short_name', 'abbr']);
  const order = readNumber(data, ['termOrder', 'order', 'term_order']);
  const classCount = readNumber(data, ['classCount', 'class_count']);
  const holidayFlag = readBoolean(data, ['isHoliday', 'holidayFlag', 'is_holiday']);

  return {
    _id: snapshot.id,
    termName,
    shortName: shortName ?? undefined,
    order: order ?? undefined,
    classCount: classCount ?? undefined,
    holidayFlag: holidayFlag ?? undefined,
  } satisfies FirestoreCalendarTerm;
}

function mapCalendarDay(snapshot: QueryDocumentSnapshot<DocumentData>): FirestoreCalendarDay {
  const data = snapshot.data();
  const date = readDateString(data, ['date', 'classDate', 'class_date']) ?? snapshot.id;
  const type = resolveDayType(readString(data, ['type', 'dayType', 'day_type']));
  const termId = readString(data, ['termId', 'term_id', 'termRef', 'term_ref']);
  const termName = readString(data, ['termName', 'term_name']);
  const termShortName = readString(data, ['termShortName', 'term_short_name', 'termShort']);
  const classWeekday = readNumber(data, ['classWeekday', 'class_weekday']);
  const classOrder = readNumber(data, ['classOrder', 'class_order']);

  return {
    _id: snapshot.id,
    date,
    type,
    termId: termId ?? undefined,
    termName: termName ?? undefined,
    termShortName: termShortName ?? undefined,
    classWeekday: classWeekday ?? undefined,
    classOrder: classOrder ?? undefined,
  } satisfies FirestoreCalendarDay;
}

function resolveDayType(value: string | undefined | null): DayType {
  if (!value) {
    return '未指定';
  }

  const normalized = value.toLowerCase();
  for (const mapping of DAY_TYPE_MAPPINGS) {
    if (mapping.keywords.some((keyword) => normalized.includes(keyword))) {
      return mapping.type;
    }
  }
  return '未指定';
}

function readString(data: DocumentData, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readNumber(data: DocumentData, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function readBoolean(data: DocumentData, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') {
        return true;
      }
      if (value.toLowerCase() === 'false') {
        return false;
      }
    }
    if (typeof value === 'number') {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
    }
  }
  return undefined;
}

function readDateString(data: DocumentData, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    const result = normalizeDateValue(value);
    if (result) {
      return result;
    }
  }
  return undefined;
}

function readDateTimeString(data: DocumentData, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }
    if (isTimestampLike(value)) {
      try {
        return new Timestamp(value.seconds, value.nanoseconds).toDate().toISOString();
      } catch (error) {
        console.warn('Failed to parse Firestore timestamp-like value', error);
      }
    }
  }
  return undefined;
}

function normalizeDateValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return formatIsoDate(value);
  }
  if (value instanceof Timestamp) {
    return formatIsoDate(value.toDate());
  }
  if (isTimestampLike(value)) {
    try {
      return formatIsoDate(new Timestamp(value.seconds, value.nanoseconds).toDate());
    } catch (error) {
      console.warn('Failed to convert timestamp-like value to ISO date', error);
    }
  }
  return undefined;
}

function isTimestampLike(value: unknown): value is { seconds: number; nanoseconds: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    'nanoseconds' in value &&
    typeof (value as { seconds: unknown }).seconds === 'number' &&
    typeof (value as { nanoseconds: unknown }).nanoseconds === 'number'
  );
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
