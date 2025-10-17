import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
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

export type GeneratedClassDate = {
  date: string;
  periods: (number | 'OD')[];
};

export type CreateTimetableClassParams = {
  userId: string;
  fiscalYear: string;
  calendarId: string;
  className: string;
  classType: 'in_person' | 'online' | 'hybrid' | 'on_demand';
  location: string;
  teacher: string;
  credits: number | null;
  creditsStatus: 'in_progress' | 'completed' | 'failed';
  maxAbsenceDays: number;
  termIds: string[];
  termNames: string[];
  weeklySlots: WeeklySlotSelection[];
  omitWeeklySlots: boolean;
  generatedClassDates: GeneratedClassDate[];
};

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

type CalendarDayOccurrence = {
  date: string;
  period: number | null;
};

function getWeekdayFromCalendarDay(day: CalendarDay): number | null {
  if (typeof day.classWeekday === 'number' && Number.isInteger(day.classWeekday)) {
    return day.classWeekday;
  }
  if (!day.date) {
    return null;
  }
  const parsed = new Date(`${day.date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const weekday = parsed.getDay();
  return ((weekday + 6) % 7) + 1;
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

function matchesPeriod(occurrence: CalendarDayOccurrence, slot: WeeklySlotSelection): boolean {
  if (slot.period === 0) {
    return true;
  }
  if (typeof occurrence.period === 'number') {
    return occurrence.period === slot.period;
  }
  return true;
}

function sortPeriodValues(a: number | 'OD', b: number | 'OD'): number {
  const weight = (value: number | 'OD') => (value === 'OD' ? 999 : value);
  return weight(a) - weight(b);
}

function buildClassDateId(date: string, periods: (number | 'OD')[]): string {
  if (periods.length === 0) {
    return date;
  }
  const suffix = periods
    .map((period) => (period === 'OD' ? 'OD' : `P${period}`))
    .sort()
    .join('_');
  return `${date}#${suffix}`;
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

export function generateClassDatesFromDays({
  days,
  termIds,
  weeklySlots,
  specialOption,
}: {
  days: CalendarDay[];
  termIds: string[];
  weeklySlots: WeeklySlotSelection[];
  specialOption: SpecialScheduleOption;
}): GeneratedClassDate[] {
  if (!Array.isArray(weeklySlots) || weeklySlots.length === 0) {
    return [];
  }

  const termSet = new Set(termIds);
  if (termSet.size === 0) {
    return [];
  }

  const groupedByWeekday = new Map<number, CalendarDayOccurrence[]>();

  for (const day of days) {
    if (day.type !== '授業日') {
      continue;
    }
    if (typeof day.termId !== 'string' || !termSet.has(day.termId)) {
      continue;
    }
    if (typeof day.date !== 'string' || day.date.length === 0) {
      continue;
    }

    const weekday = getWeekdayFromCalendarDay(day);
    if (weekday === null) {
      continue;
    }

    const period =
      typeof day.classOrder === 'number' && Number.isFinite(day.classOrder)
        ? Math.trunc(day.classOrder)
        : null;

    const list = groupedByWeekday.get(weekday) ?? [];
    list.push({
      date: day.date,
      period,
    });
    groupedByWeekday.set(weekday, list);
  }

  for (const list of groupedByWeekday.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const dateMap = new Map<string, Set<number | 'OD'>>();

  for (const slot of weeklySlots) {
    const candidates = groupedByWeekday.get(slot.dayOfWeek) ?? [];
    const filtered = applySpecialScheduleOption(
      candidates.filter((occurrence) => matchesPeriod(occurrence, slot)),
      specialOption,
    );

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

export function computeRecommendedMaxAbsence(totalClasses: number): number {
  if (!Number.isFinite(totalClasses) || totalClasses <= 0) {
    return 0;
  }
  const raw = Math.floor(totalClasses * 0.33);
  const value = Math.max(raw, 0);
  return Math.min(value, totalClasses);
}

export async function createTimetableClass(params: CreateTimetableClassParams) {
  const {
    userId,
    fiscalYear,
    calendarId,
    className,
    classType,
    location,
    teacher,
    credits,
    creditsStatus,
    maxAbsenceDays,
    termIds,
    termNames,
    weeklySlots,
    omitWeeklySlots,
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
  const batch = writeBatch(db);
  const timestamp = serverTimestamp();

  const uniqueTermNames = Array.from(
    new Set(termNames.map((name) => name.trim()).filter((name) => name.length > 0)),
  );
  const termDisplayName = uniqueTermNames.length > 0 ? uniqueTermNames.join(', ') : null;

  const normalizedLocation = location.trim();
  const normalizedTeacher = teacher.trim();

  batch.set(classRef, {
    className: trimmedClassName,
    fiscalYear: fiscalYearNumber,
    calendarId: calendarId.trim(),
    termNames: uniqueTermNames,
    termDisplayName,
    classType,
    credits: typeof credits === 'number' && Number.isFinite(credits) ? credits : null,
    creditsStatus,
    teacher: normalizedTeacher.length > 0 ? normalizedTeacher : null,
    location: normalizedLocation.length > 0 ? normalizedLocation : null,
    memo: null,
    omitWeeklySlots,
    maxAbsenceDays,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (!omitWeeklySlots) {
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
    const classDateId = buildClassDateId(item.date, item.periods);
    const classDateRef: DocumentReference = doc(
      collection(classRef, 'class_dates'),
      classDateId,
    );

    const periodsOrderKey = item.periods.reduce<number>((min, period) => {
      if (period === 'OD') {
        return Math.min(min, 999);
      }
      return Math.min(min, period);
    }, 999);

    batch.set(classDateRef, {
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
