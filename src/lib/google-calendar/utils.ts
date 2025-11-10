import { GOOGLE_CALENDAR_DEFAULT_FISCAL_YEAR_START_MONTH } from './constants';

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= startMonth ? year : year - 1;
}

export function enumerateDateKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (current <= last) {
    keys.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return keys;
}

export function enumerateMonthKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (current <= last) {
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    keys.push(key);
    current.setMonth(current.getMonth() + 1);
  }
  return keys;
}

export function enumerateFiscalYearKeys(start: Date, end: Date): string[] {
  const years = new Set<number>();
  const current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    years.add(getFiscalYearFromDate(current));
    current.setMonth(current.getMonth() + 1);
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
