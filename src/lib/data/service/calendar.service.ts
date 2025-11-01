import {
  ensureCalendarDataCached,
  listCalendarDays,
  listCalendarTerms,
} from '../repository/calendar.repository';

export function validateCalendarQueryParams(
  fiscalYear: string,
  calendarId: string,
) {
  if (!fiscalYear.trim() || !calendarId.trim()) {
    throw new Error('年度とカレンダーIDを入力してください。');
  }
}

export async function getCalendarTerms(
  fiscalYear: string,
  calendarId: string,
) {
  validateCalendarQueryParams(fiscalYear, calendarId);
  return listCalendarTerms(fiscalYear, calendarId);
}

export async function getCalendarDays(
  fiscalYear: string,
  calendarId: string,
) {
  validateCalendarQueryParams(fiscalYear, calendarId);
  return listCalendarDays(fiscalYear, calendarId);
}

export async function ensureCalendarDataIsCached(
  fiscalYear: string,
  calendarId: string,
) {
  validateCalendarQueryParams(fiscalYear, calendarId);
  await ensureCalendarDataCached(fiscalYear, calendarId);
}
