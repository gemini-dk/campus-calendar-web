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
