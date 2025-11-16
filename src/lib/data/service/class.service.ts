import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Query,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/client';

import { listCalendarDays, listCalendarTerms } from '../repository/calendar.repository';
import type { CalendarDay, CalendarTerm } from '../schema/calendar';
import { validateCalendarQueryParams } from './calendar.service';

export type ClassScheduleParams = {
  fiscalYear: string;
  calendarId: string;
  termIds: string[];
  weekdays: number[];
};

export type ClassScheduleItem = {
  dayId: string;
  date: string;
  classWeekday: number | null;
  period: number | null;
  termId: string;
  termName: string;
};

export type WeeklySlotSelection = {
  dayOfWeek: number;
  period: number;
};

export type SpecialScheduleOption =
  | 'all'
  | 'first_half'
  | 'second_half'
  | 'odd_weeks'
  | 'even_weeks';

export const SPECIAL_SCHEDULE_OPTION_LABELS: Record<SpecialScheduleOption, string> = {
  all: 'すべて',
  first_half: '前半週',
  second_half: '後半週',
  odd_weeks: '奇数週',
  even_weeks: '偶数週',
};

export type GeneratedClassDate = {
  date: string;
  periods: (number | 'OD')[];
};

export type UpdateClassDateScheduleInput = {
  userId: string;
  fiscalYear: string;
  classId: string;
  classDateId: string;
  classDate: string;
  periods: (number | 'OD')[];
};

export type UpdateClassDateCancellationInput = {
  userId: string;
  fiscalYear: string;
  classId: string;
  classDateId: string;
  mode: 'present' | 'absent' | 'exclude';
};

export type TimetableClassSummary = {
  fiscalYear: string;
  id: string;
  className: string;
};

export type CreateTimetableClassParams = {
  userId: string;
  fiscalYear: string;
  calendarId: string;
  className: string;
  classType: 'in_person' | 'online' | 'hybrid' | 'on_demand';
  isFullyOnDemand: boolean;
  location: string;
  locationInPerson: string;
  locationOnline: string;
  teacher: string;
  credits: number | null;
  creditsStatus: 'in_progress' | 'completed' | 'failed';
  maxAbsenceDays: number;
  termIds: string[];
  termNames: string[];
  specialOption: SpecialScheduleOption;
  weeklySlots: WeeklySlotSelection[];
  generatedClassDates: GeneratedClassDate[];
};

export type UpdateTimetableClassParams = {
  userId: string;
  classId: string;
  originalFiscalYear: string;
  newFiscalYear: string;
  calendarId: string;
  className: string;
  classType: CreateTimetableClassParams["classType"];
  isFullyOnDemand: boolean;
  location: string;
  locationInPerson: string;
  locationOnline: string;
  teacher: string;
  credits: number | null;
  creditsStatus: CreateTimetableClassParams["creditsStatus"];
  maxAbsenceDays: number;
  termIds: string[];
  termNames: string[];
  specialOption: SpecialScheduleOption;
  weeklySlots: WeeklySlotSelection[];
  generatedClassDates: GeneratedClassDate[];
  existingWeeklySlotIds: string[];
  existingClassDateIds: string[];
  shouldUpdateSchedule: boolean;
};

export type TimetableClassDocRefParams = {
  userId: string;
  fiscalYear: string;
  classId: string;
};

function normalizeUserAndYear({
  userId,
  fiscalYear,
}: {
  userId: string;
  fiscalYear: string;
}): { userId: string; fiscalYear: string } | null {
  const trimmedUserId = userId.trim();
  const trimmedFiscalYear = fiscalYear.trim();

  if (!trimmedUserId || !trimmedFiscalYear) {
    return null;
  }

  return { userId: trimmedUserId, fiscalYear: trimmedFiscalYear };
}

export function getTimetableClassDocRef({
  userId,
  fiscalYear,
  classId,
}: TimetableClassDocRefParams): DocumentReference<DocumentData> | null {
  const normalized = normalizeUserAndYear({ userId, fiscalYear });
  const trimmedClassId = classId.trim();

  if (!normalized || !trimmedClassId) {
    return null;
  }

  return doc(
    db,
    'users',
    normalized.userId,
    'academic_years',
    normalized.fiscalYear,
    'timetable_classes',
    trimmedClassId,
  );
}

export function getTimetableClassWeeklySlotsCollection({
  userId,
  fiscalYear,
  classId,
}: TimetableClassDocRefParams): CollectionReference<DocumentData> | null {
  const classRef = getTimetableClassDocRef({ userId, fiscalYear, classId });

  if (!classRef) {
    return null;
  }

  return collection(classRef, 'weekly_slots');
}

export function getAcademicYearClassDatesQuery({
  userId,
  fiscalYear,
  classId,
}: TimetableClassDocRefParams): Query<DocumentData> | null {
  const classRef = getTimetableClassDocRef({ userId, fiscalYear, classId });

  if (!classRef) {
    return null;
  }

  const classDatesRef = collection(classRef, 'class_dates');

  return query(classDatesRef, orderBy('classDate', 'desc'));
}

export function getUserActivitiesQuery(userId: string): Query<DocumentData> | null {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId) {
    return null;
  }

  const activitiesRef = collection(db, 'users', trimmedUserId, 'activities');
  return query(activitiesRef, orderBy('createdAt', 'desc'));
}

function normalizeClassDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export async function findNextClassDateAfter({
  userId,
  fiscalYear,
  classId,
  classDate,
}: {
  userId: string;
  fiscalYear: string;
  classId: string;
  classDate: string;
}): Promise<string | null> {
  const classRef = getTimetableClassDocRef({ userId, fiscalYear, classId });
  if (!classRef) {
    return null;
  }

  const normalizedDate = normalizeClassDate(classDate);
  if (!normalizedDate) {
    return null;
  }

  const classDatesCollection = collection(classRef, 'class_dates');
  const nextDateQuery = query(
    classDatesCollection,
    orderBy('classDate', 'asc'),
    startAfter(normalizedDate),
    limit(1),
  );

  const snapshot = await getDocs(nextDateQuery);
  if (snapshot.empty) {
    return null;
  }

  const docSnapshot = snapshot.docs[0];
  const data = docSnapshot.data();
  const nextDate = typeof data.classDate === 'string' ? data.classDate : null;
  if (!nextDate) {
    return null;
  }

  return nextDate;
}

function buildTermNameMap(terms: CalendarTerm[]): Map<string, string> {
  return terms.reduce<Map<string, string>>((map, term) => {
    if (term.id) {
      map.set(term.id, term.name);
    }
    return map;
  }, new Map());
}

function sortScheduleItems(a: ClassScheduleItem, b: ClassScheduleItem): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  const periodA = typeof a.period === 'number' ? a.period : Number.MAX_SAFE_INTEGER;
  const periodB = typeof b.period === 'number' ? b.period : Number.MAX_SAFE_INTEGER;
  if (periodA !== periodB) {
    return periodA - periodB;
  }
  const weekdayA = typeof a.classWeekday === 'number' ? a.classWeekday : Number.MAX_SAFE_INTEGER;
  const weekdayB = typeof b.classWeekday === 'number' ? b.classWeekday : Number.MAX_SAFE_INTEGER;
  return weekdayA - weekdayB;
}

function shouldIncludeDay(
  day: CalendarDay,
  termSet: Set<string>,
  weekdaySet: Set<number>,
): day is CalendarDay & { termId: string; classWeekday: number; date: string } {
  if (day.type !== '授業日') {
    return false;
  }
  if (typeof day.termId !== 'string' || !termSet.has(day.termId)) {
    return false;
  }
  if (typeof day.classWeekday !== 'number' || !weekdaySet.has(day.classWeekday)) {
    return false;
  }
  return typeof day.date === 'string' && day.date.length > 0;
}

export async function generateClassSchedule({
  fiscalYear,
  calendarId,
  termIds,
  weekdays,
}: ClassScheduleParams): Promise<ClassScheduleItem[]> {
  validateCalendarQueryParams(fiscalYear, calendarId);
  if (!Array.isArray(termIds) || termIds.length === 0) {
    return [];
  }
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    return [];
  }

  const termSet = new Set(termIds);
  const weekdaySet = new Set(
    weekdays.filter(
      (weekday): weekday is number =>
        typeof weekday === 'number' && Number.isInteger(weekday) && weekday >= 1 && weekday <= 7,
    ),
  );

  if (weekdaySet.size === 0) {
    return [];
  }

  const [terms, days] = await Promise.all([
    listCalendarTerms(fiscalYear, calendarId),
    listCalendarDays(fiscalYear, calendarId),
  ]);

  const termNameMap = buildTermNameMap(terms);

  const items: ClassScheduleItem[] = [];

  for (const day of days) {
    if (!shouldIncludeDay(day, termSet, weekdaySet)) {
      continue;
    }

    const termName = termNameMap.get(day.termId) ?? day.termName ?? day.termId;
    const period =
      typeof day.classOrder === 'number' && Number.isFinite(day.classOrder)
        ? day.classOrder
        : null;

    items.push({
      dayId: day.id,
      date: day.date,
      classWeekday: day.classWeekday,
      period,
      termId: day.termId,
      termName,
    });
  }

  return items.sort(sortScheduleItems);
}

export async function listTimetableClassesByYear({
  userId,
  fiscalYear,
}: {
  userId: string;
  fiscalYear: string;
}): Promise<TimetableClassSummary[]> {
  const trimmedUserId = userId.trim();
  const trimmedFiscalYear = fiscalYear.trim();

  if (!trimmedUserId || !trimmedFiscalYear) {
    return [];
  }

  const classesCollection = collection(
    db,
    'users',
    trimmedUserId,
    'academic_years',
    trimmedFiscalYear,
    'timetable_classes',
  );

  const classesQuery = query(classesCollection, orderBy('className', 'asc'));
  const snapshot = await getDocs(classesQuery);

  const items: TimetableClassSummary[] = [];

  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data();
    const className =
      typeof data.className === 'string' ? data.className.trim() : '';

    if (!className) {
      return;
    }

    items.push({
      fiscalYear: trimmedFiscalYear,
      id: docSnapshot.id,
      className,
    });
  });

  return items;
}

function applySpecialScheduleOption<T>(
  items: T[],
  option: SpecialScheduleOption,
): T[] {
  const total = items.length;
  if (total === 0) {
    return [];
  }

  switch (option) {
    case 'first_half': {
      const count = Math.ceil(total / 2);
      return items.slice(0, count);
    }
    case 'second_half': {
      const start = Math.floor(total / 2);
      return items.slice(start);
    }
    case 'odd_weeks': {
      return items.filter((_, index) => (index + 1) % 2 === 1);
    }
    case 'even_weeks': {
      return items.filter((_, index) => (index + 1) % 2 === 0);
    }
    case 'all':
    default:
      return items;
  }
}

function sortPeriodValues(a: number | 'OD', b: number | 'OD'): number {
  const weight = (value: number | 'OD') => (value === 'OD' ? 999 : value);
  return weight(a) - weight(b);
}

function buildClassDateId(
  classId: string,
  date: string,
  periods: (number | 'OD')[],
): string {
  const trimmedClassId = classId.trim();
  const dateKey = (() => {
    if (periods.length === 0) {
      return date;
    }
    const suffix = periods
      .map((period) => (period === 'OD' ? 'OD' : `P${period}`))
      .sort()
      .join('_');
    return `${date}#${suffix}`;
  })();
  return `${trimmedClassId}#${dateKey}`;
}

function buildDeliveryType(classType: CreateTimetableClassParams['classType']) {
  switch (classType) {
    case 'in_person':
      return 'in_person';
    case 'online':
      return 'remote';
    case 'hybrid':
      return 'unknown';
    case 'on_demand':
      return 'remote';
    default:
      return 'unknown';
  }
}

function buildGeneratedClassDatesFromSchedule(
  scheduleItems: ClassScheduleItem[],
  weeklySlots: WeeklySlotSelection[],
  specialOption: SpecialScheduleOption,
): GeneratedClassDate[] {
  if (scheduleItems.length === 0 || weeklySlots.length === 0) {
    return [];
  }

  const groupedByWeekday = new Map<number, ClassScheduleItem[]>();

  for (const item of scheduleItems) {
    if (typeof item.classWeekday !== 'number') {
      continue;
    }
    const list = groupedByWeekday.get(item.classWeekday) ?? [];
    list.push(item);
    groupedByWeekday.set(item.classWeekday, list);
  }

  for (const list of groupedByWeekday.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const dateMap = new Map<string, Set<number | 'OD'>>();

  for (const slot of weeklySlots) {
    const occurrences = groupedByWeekday.get(slot.dayOfWeek) ?? [];
    const filtered = applySpecialScheduleOption(occurrences, specialOption);

    for (const occurrence of filtered) {
      const periods = dateMap.get(occurrence.date) ?? new Set<number | 'OD'>();
      periods.add(slot.period === 0 ? 'OD' : slot.period);
      dateMap.set(occurrence.date, periods);
    }
  }

  return Array.from(dateMap.entries())
    .map(([date, periods]) => ({
      date,
      periods: Array.from(periods.values()).sort(sortPeriodValues),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function extractUniqueWeekdays(slots: WeeklySlotSelection[]): number[] {
  const weekdays = slots
    .map((slot) => slot.dayOfWeek)
    .filter(
      (weekday): weekday is number =>
        typeof weekday === 'number' && Number.isInteger(weekday) && weekday >= 1 && weekday <= 7,
    );
  return Array.from(new Set(weekdays));
}

export async function generateClassDates({
  fiscalYear,
  calendarId,
  termIds,
  weeklySlots,
  specialOption,
}: {
  fiscalYear: string;
  calendarId: string;
  termIds: string[];
  weeklySlots: WeeklySlotSelection[];
  specialOption: SpecialScheduleOption;
}): Promise<GeneratedClassDate[]> {
  if (!Array.isArray(weeklySlots) || weeklySlots.length === 0) {
    return [];
  }

  const weekdays = extractUniqueWeekdays(weeklySlots);
  if (weekdays.length === 0) {
    return [];
  }

  const scheduleItems = await generateClassSchedule({
    fiscalYear,
    calendarId,
    termIds,
    weekdays,
  });

  return buildGeneratedClassDatesFromSchedule(scheduleItems, weeklySlots, specialOption);
}

export function computeRecommendedMaxAbsence(totalClasses: number): number {
  if (!Number.isFinite(totalClasses) || totalClasses <= 0) {
    return 0;
  }
  const threshold = Math.ceil(totalClasses * 0.7);
  const recommended = totalClasses - threshold;
  if (recommended <= 0) {
    return 0;
  }
  return Math.min(recommended, totalClasses);
}

export async function createTimetableClass(params: CreateTimetableClassParams) {
  const {
    userId,
    fiscalYear,
    calendarId,
    className,
    classType,
    isFullyOnDemand,
    location,
    locationInPerson,
    locationOnline,
    teacher,
    credits,
    creditsStatus,
    maxAbsenceDays,
    termIds,
    termNames,
    specialOption,
    weeklySlots,
    generatedClassDates,
  } = params;

  if (!userId) {
    throw new Error('ユーザーIDが必要です。');
  }

  validateCalendarQueryParams(fiscalYear, calendarId);

  const trimmedClassName = className.trim();
  if (!trimmedClassName) {
    throw new Error('授業名を入力してください。');
  }

  const fiscalYearNumber = Number.parseInt(fiscalYear, 10);
  if (!Number.isFinite(fiscalYearNumber)) {
    throw new Error('年度は数値で入力してください。');
  }

  const classCollection = collection(
    db,
    'users',
    userId,
    'academic_years',
    fiscalYear,
    'timetable_classes',
  );
  const classRef = doc(classCollection);
  const classDatesCollection = collection(classRef, 'class_dates');
  const batch = writeBatch(db);
  const timestamp = serverTimestamp();

  const uniqueTermNames = Array.from(
    new Set(termNames.map((name) => name.trim()).filter((name) => name.length > 0)),
  );
  const termDisplayName = uniqueTermNames.length > 0 ? uniqueTermNames.join(', ') : null;

  const uniqueTermIds = Array.from(
    new Set(termIds.map((termId) => termId.trim()).filter((termId) => termId.length > 0)),
  );

  const specialScheduleOption: SpecialScheduleOption =
    SPECIAL_SCHEDULE_OPTION_LABELS[specialOption] ? specialOption : 'all';

  const normalizedLocation = location.trim();
  const normalizedLocationInPerson = locationInPerson.trim();
  const normalizedLocationOnline = locationOnline.trim();
  const normalizedTeacher = teacher.trim();

  batch.set(classRef, {
    className: trimmedClassName,
    fiscalYear: fiscalYearNumber,
    calendarId: calendarId.trim(),
    termIds: uniqueTermIds,
    termNames: uniqueTermNames,
    termDisplayName,
    classType,
    isFullyOnDemand,
    specialScheduleOption,
    credits: typeof credits === 'number' && Number.isFinite(credits) ? credits : null,
    creditsStatus,
    teacher: normalizedTeacher.length > 0 ? normalizedTeacher : null,
    location: normalizedLocation.length > 0 ? normalizedLocation : null,
    locationInPerson:
      classType === 'hybrid' && normalizedLocationInPerson.length > 0
        ? normalizedLocationInPerson
        : null,
    locationOnline:
      classType === 'hybrid' && normalizedLocationOnline.length > 0
        ? normalizedLocationOnline
        : null,
    memo: null,
    maxAbsenceDays,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const shouldPersistWeeklySlots = !isFullyOnDemand && weeklySlots.length > 0;
  if (shouldPersistWeeklySlots) {
    const uniqueSlots = new Map<string, WeeklySlotSelection>();
    weeklySlots.forEach((slot) => {
      const key = `${slot.dayOfWeek}-${slot.period}`;
      if (!uniqueSlots.has(key)) {
        uniqueSlots.set(key, slot);
      }
    });

    let displayOrder = 1;
    for (const slot of uniqueSlots.values()) {
      const slotRef = doc(collection(classRef, 'weekly_slots'));
      batch.set(slotRef, {
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        displayOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      displayOrder += 1;
    }
  }

  for (const item of generatedClassDates) {
    if (!item.date || item.periods.length === 0) {
      continue;
    }
    const classDateId = buildClassDateId(classRef.id, item.date, item.periods);
    const classDateRef: DocumentReference = doc(classDatesCollection, classDateId);

    const periodsOrderKey = item.periods.reduce<number>((min, period) => {
      if (period === 'OD') {
        return Math.min(min, 999);
      }
      return Math.min(min, period);
    }, 999);

    batch.set(classDateRef, {
      classId: classRef.id,
      classDate: item.date,
      periods: item.periods,
      attendanceStatus: null,
      isTest: false,
      isExcludedFromSummary: false,
      isAutoGenerated: true,
      isCancelled: false,
      deliveryType: buildDeliveryType(classType),
      hasUserModifications: false,
      periodsOrderKey,
      updatedAt: timestamp,
    });
  }

  await batch.commit();
}

export async function updateClassDateSchedule({
  userId,
  fiscalYear,
  classId,
  classDateId,
  classDate,
  periods,
}: UpdateClassDateScheduleInput): Promise<void> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    throw new Error('ユーザIDが無効です。');
  }

  const trimmedFiscalYear = fiscalYear.trim();
  if (!trimmedFiscalYear) {
    throw new Error('年度情報が無効です。');
  }

  const trimmedClassId = classId.trim();
  if (!trimmedClassId) {
    throw new Error('授業IDが無効です。');
  }

  const trimmedClassDateId = classDateId.trim();
  if (!trimmedClassDateId) {
    throw new Error('授業日程IDが無効です。');
  }

  const normalizedDate = normalizeClassDate(classDate);
  if (!normalizedDate) {
    throw new Error('日付の形式が正しくありません。');
  }

  const normalizedPeriods = Array.from(
    new Set(
      periods
        .map((period) => {
          if (period === 'OD') {
            return 'OD';
          }
          if (typeof period === 'number' && Number.isFinite(period) && period > 0) {
            return Math.trunc(period);
          }
          return null;
        })
        .filter((value): value is number | 'OD' => value !== null),
    ),
  ).sort(sortPeriodValues);

  if (normalizedPeriods.length === 0) {
    throw new Error('少なくとも1つの時限を選択してください。');
  }

  const classRef = getTimetableClassDocRef({
    userId: trimmedUserId,
    fiscalYear: trimmedFiscalYear,
    classId: trimmedClassId,
  });
  if (!classRef) {
    throw new Error('授業情報が取得できませんでした。');
  }

  const classDateRef = doc(collection(classRef, 'class_dates'), trimmedClassDateId);
  const periodsOrderKey = normalizedPeriods.reduce<number>((min, period) => {
    if (period === 'OD') {
      return Math.min(min, 999);
    }
    return Math.min(min, period);
  }, 999);

  await updateDoc(classDateRef, {
    classDate: normalizedDate,
    periods: normalizedPeriods,
    periodsOrderKey,
    hasUserModifications: true,
    isAutoGenerated: false,
    isCancelled: false,
    updatedAt: serverTimestamp(),
  });
}

export async function updateClassDateCancellation({
  userId,
  fiscalYear,
  classId,
  classDateId,
  mode,
}: UpdateClassDateCancellationInput): Promise<void> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    throw new Error('ユーザIDが無効です。');
  }

  const trimmedFiscalYear = fiscalYear.trim();
  if (!trimmedFiscalYear) {
    throw new Error('年度情報が無効です。');
  }

  const trimmedClassId = classId.trim();
  if (!trimmedClassId) {
    throw new Error('授業IDが無効です。');
  }

  const trimmedClassDateId = classDateId.trim();
  if (!trimmedClassDateId) {
    throw new Error('授業日程IDが無効です。');
  }

  const classRef = getTimetableClassDocRef({
    userId: trimmedUserId,
    fiscalYear: trimmedFiscalYear,
    classId: trimmedClassId,
  });
  if (!classRef) {
    throw new Error('授業情報が取得できませんでした。');
  }

  const classDateRef = doc(collection(classRef, 'class_dates'), trimmedClassDateId);

  const updatePayload: Record<string, unknown> = {
    isCancelled: true,
    isAutoGenerated: false,
    hasUserModifications: true,
    updatedAt: serverTimestamp(),
  };

  if (mode === 'present') {
    updatePayload.attendanceStatus = 'present';
    updatePayload.isExcludedFromSummary = false;
  } else if (mode === 'absent') {
    updatePayload.attendanceStatus = 'absent';
    updatePayload.isExcludedFromSummary = false;
  } else {
    updatePayload.attendanceStatus = null;
    updatePayload.isExcludedFromSummary = true;
  }

  await updateDoc(classDateRef, updatePayload);
}

export async function updateTimetableClass({
  userId,
  classId,
  originalFiscalYear,
  newFiscalYear,
  calendarId,
  className,
  classType,
  isFullyOnDemand,
  location,
  locationInPerson,
  locationOnline,
  teacher,
  credits,
  creditsStatus,
  maxAbsenceDays,
  termIds,
  termNames,
  specialOption,
  weeklySlots,
  generatedClassDates,
  existingWeeklySlotIds,
  existingClassDateIds,
  shouldUpdateSchedule,
}: UpdateTimetableClassParams): Promise<void> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    throw new Error('ユーザIDが無効です。');
  }

  const trimmedClassId = classId.trim();
  if (!trimmedClassId) {
    throw new Error('授業IDが無効です。');
  }

  const trimmedClassName = className.trim();
  if (!trimmedClassName) {
    throw new Error('授業名を入力してください。');
  }

  const trimmedOriginalYear = originalFiscalYear.trim();
  const trimmedNewYear = newFiscalYear.trim();
  if (!trimmedOriginalYear || !trimmedNewYear) {
    throw new Error('年度を指定してください。');
  }

  const fiscalYearNumber = Number.parseInt(trimmedNewYear, 10);
  if (!Number.isFinite(fiscalYearNumber)) {
    throw new Error('年度は数値で入力してください。');
  }

  const trimmedCalendarId = calendarId.trim();
  if (!trimmedCalendarId) {
    throw new Error('学事カレンダーIDを指定してください。');
  }

  const isMovingFiscalYear = trimmedOriginalYear !== trimmedNewYear;
  if (isMovingFiscalYear && !shouldUpdateSchedule) {
    throw new Error('出席記録があるため年度を変更できません。');
  }

  const classCollection = (fiscalYear: string) =>
    collection(db, 'users', trimmedUserId, 'academic_years', fiscalYear, 'timetable_classes');
  const buildClassRef = (fiscalYear: string) =>
    doc(classCollection(fiscalYear), trimmedClassId);
  const classDatesCollection = (classRef: DocumentReference) => collection(classRef, 'class_dates');

  const sourceClassRef = buildClassRef(trimmedOriginalYear);
  const targetClassRef = buildClassRef(trimmedNewYear);

  const batch = writeBatch(db);
  const timestamp = serverTimestamp();

  const uniqueTermIds = Array.from(
    new Set(termIds.map((termId) => termId.trim()).filter((termId) => termId.length > 0)),
  );

  const uniqueTermNames = Array.from(
    new Set(termNames.map((name) => name.trim()).filter((name) => name.length > 0)),
  );

  const termDisplayName = uniqueTermNames.length > 0 ? uniqueTermNames.join(', ') : null;

  const specialScheduleOption: SpecialScheduleOption =
    SPECIAL_SCHEDULE_OPTION_LABELS[specialOption] ? specialOption : 'all';

  const normalizedLocation = location.trim();
  const normalizedLocationInPerson = locationInPerson.trim();
  const normalizedLocationOnline = locationOnline.trim();
  const normalizedTeacher = teacher.trim();
  const normalizedCredits =
    typeof credits === 'number' && Number.isFinite(credits) ? credits : null;

  const classData: Record<string, unknown> = {
    className: trimmedClassName,
    fiscalYear: fiscalYearNumber,
    calendarId: trimmedCalendarId,
    termIds: uniqueTermIds,
    termNames: uniqueTermNames,
    termDisplayName,
    classType,
    isFullyOnDemand,
    specialScheduleOption,
    credits: normalizedCredits,
    creditsStatus,
    teacher: normalizedTeacher.length > 0 ? normalizedTeacher : null,
    location: normalizedLocation.length > 0 ? normalizedLocation : null,
    locationInPerson:
      classType === 'hybrid' && normalizedLocationInPerson.length > 0
        ? normalizedLocationInPerson
        : null,
    locationOnline:
      classType === 'hybrid' && normalizedLocationOnline.length > 0
        ? normalizedLocationOnline
        : null,
    maxAbsenceDays,
    updatedAt: timestamp,
  };

  if (isMovingFiscalYear) {
    classData.createdAt = timestamp;
  }

  batch.set(targetClassRef, classData, { merge: true });

  if (shouldUpdateSchedule) {
    for (const slotId of existingWeeklySlotIds) {
      const trimmedSlotId = slotId.trim();
      if (!trimmedSlotId) {
        continue;
      }
      const slotRef = doc(collection(sourceClassRef, 'weekly_slots'), trimmedSlotId);
      batch.delete(slotRef);
    }

    for (const dateId of existingClassDateIds) {
      const trimmedDateId = dateId.trim();
      if (!trimmedDateId) {
        continue;
      }
      const dateRef = doc(classDatesCollection(sourceClassRef), trimmedDateId);
      batch.delete(dateRef);
    }

    if (isMovingFiscalYear) {
      batch.delete(sourceClassRef);
    }

    const shouldPersistWeeklySlots = !isFullyOnDemand && weeklySlots.length > 0;
    if (shouldPersistWeeklySlots) {
      const uniqueSlots = new Map<string, WeeklySlotSelection>();
      weeklySlots.forEach((slot) => {
        const key = `${slot.dayOfWeek}-${slot.period}`;
        if (!uniqueSlots.has(key)) {
          uniqueSlots.set(key, slot);
        }
      });

      let displayOrder = 1;
      for (const slot of uniqueSlots.values()) {
        const slotRef = doc(collection(targetClassRef, 'weekly_slots'));
        batch.set(slotRef, {
          dayOfWeek: slot.dayOfWeek,
          period: slot.period,
          displayOrder,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        displayOrder += 1;
      }
    }

    if (!isFullyOnDemand) {
      for (const item of generatedClassDates) {
        if (!item.date || item.periods.length === 0) {
          continue;
        }
        const classDateId = buildClassDateId(trimmedClassId, item.date, item.periods);
        const classDateRef: DocumentReference = doc(
          classDatesCollection(targetClassRef),
          classDateId,
        );

        const periodsOrderKey = item.periods.reduce<number>((min, period) => {
          if (period === 'OD') {
            return Math.min(min, 999);
          }
          return Math.min(min, period);
        }, 999);

        batch.set(classDateRef, {
          classId: trimmedClassId,
          classDate: item.date,
          periods: item.periods,
          attendanceStatus: null,
          isTest: false,
          isExcludedFromSummary: false,
          isAutoGenerated: true,
          isCancelled: false,
          deliveryType: buildDeliveryType(classType),
          hasUserModifications: false,
          periodsOrderKey,
          updatedAt: timestamp,
        });
      }
    }
  }

  await batch.commit();
}
