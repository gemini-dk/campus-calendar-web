import { GOOGLE_CALENDAR_DEFAULT_FISCAL_YEAR_START_MONTH } from './constants';

const JST_TIME_ZONE = 'Asia/Tokyo';
const JST_TIME_ZONE_OFFSET = '+09:00';

export function toDateKey(date: Date, timeZone = JST_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function normalizeIsoDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function getFiscalYearFromDate(
  date: Date,
  startMonth = GOOGLE_CALENDAR_DEFAULT_FISCAL_YEAR_START_MONTH,
  timeZone = JST_TIME_ZONE,
): number {
  const { year, month } = getDatePartsInTimeZone(date, timeZone);
  return month >= startMonth ? year : year - 1;
}

export function enumerateDateKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const current = createMidnightDateFromKey(toDateKey(start));
  const last = createMidnightDateFromKey(toDateKey(end));
  while (current <= last) {
    keys.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return keys;
}

export function enumerateMonthKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const startParts = getDatePartsInTimeZone(start);
  const endParts = getDatePartsInTimeZone(end);
  let year = startParts.year;
  let month = startParts.month;

  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

export function enumerateFiscalYearKeys(start: Date, end: Date): string[] {
  const years = new Set<number>();
  const startParts = getDatePartsInTimeZone(start);
  const endParts = getDatePartsInTimeZone(end);
  let year = startParts.year;
  let month = startParts.month;

  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    const fiscalYear = month >= GOOGLE_CALENDAR_DEFAULT_FISCAL_YEAR_START_MONTH ? year : year - 1;
    years.add(fiscalYear);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return Array.from(years).map(String);
}

export function toTimestamp(value: string | undefined | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampTimestamp(value: number | null, fallback: number): number {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function getDatePartsInTimeZone(
  date: Date,
  timeZone = JST_TIME_ZONE,
): { year: number; month: number; day: number } {
  const key = toDateKey(date, timeZone);
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

function createMidnightDateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00${JST_TIME_ZONE_OFFSET}`);
}
