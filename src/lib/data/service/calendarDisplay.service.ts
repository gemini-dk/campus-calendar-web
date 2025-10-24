import type { CalendarDay, CalendarTerm } from '../schema/calendar';
import { getCalendarDay, listCalendarTerms } from '../repository/calendar.repository';

const WEEKDAY_LABEL_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_LABEL_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

type AccentColor = 'default' | 'holiday' | 'saturday';
type BackgroundColorType = 'none' | 'sunday' | 'holiday' | 'exam' | 'reserve';

export type CalendarGeneralDisplay = {
  dateLabel: string;
  dateTextColor: AccentColor;
  weekdayLabel: string;
  weekdayTextColor: AccentColor;
  weekdayNumber: number;
  calendarSupplementalText: string;
};

export type CalendarAcademicDisplay = {
  label: string;
  weekdayNumber: number | null;
  weekdayLabel: string | null;
  classOrder: number | null;
  backgroundColor: BackgroundColorType;
  subLabel: string | null;
};

export type CalendarDisplayInfo = {
  calendar: CalendarGeneralDisplay;
  academic: CalendarAcademicDisplay;
  day: CalendarDay | null;
  term: CalendarTerm | null;
};

type NormalizedDayType = 'class' | 'holiday' | 'exam' | 'reserve' | 'other';

const DEFAULT_GENERAL_DISPLAY: CalendarGeneralDisplay = {
  dateLabel: '-',
  dateTextColor: 'default',
  weekdayLabel: '-',
  weekdayTextColor: 'default',
  weekdayNumber: -1,
  calendarSupplementalText: '-',
};

const DEFAULT_ACADEMIC_DISPLAY: CalendarAcademicDisplay = {
  label: '-',
  weekdayNumber: null,
  weekdayLabel: null,
  classOrder: null,
  backgroundColor: 'none',
  subLabel: null,
};

type CalendarDisplayOptions = {
  hasSaturdayClasses?: boolean;
};

export async function getCalendarDisplayInfo(
  fiscalYear: string,
  calendarId: string,
  dateId: string,
  options: CalendarDisplayOptions = {},
): Promise<CalendarDisplayInfo> {
  const [day, terms] = await Promise.all([
    getCalendarDay(fiscalYear, calendarId, dateId),
    listCalendarTerms(fiscalYear, calendarId),
  ]);

  const parsedDate = safeParseDate(dateId);
  const weekdayNumber = parsedDate.getDay();

  const generalDisplay = computeGeneralDisplay(day, dateId, weekdayNumber);
  const term = resolveTermForDay(day, terms);
  const academicDisplay = computeAcademicDisplay(day, term, weekdayNumber, parsedDate, options);

  return {
    calendar: generalDisplay,
    academic: academicDisplay,
    day,
    term,
  };
}

function safeParseDate(dateId: string): Date {
  return new Date(`${dateId}T00:00:00`);
}

function computeGeneralDisplay(
  day: CalendarDay | null,
  dateId: string,
  weekdayNumber: number,
): CalendarGeneralDisplay {
  const labelDate = day?.date ?? dateId;
  if (!day) {
    const weekdayLabel = WEEKDAY_LABEL_EN[weekdayNumber] ?? '-';
    return {
      ...DEFAULT_GENERAL_DISPLAY,
      dateLabel: labelDate,
      weekdayLabel,
      weekdayNumber,
      calendarSupplementalText: formatJapaneseDate(labelDate, weekdayNumber),
    };
  }

  const accentColor = determineAccentColor(day, weekdayNumber);
  const weekdayLabel = WEEKDAY_LABEL_EN[weekdayNumber] ?? '-';
  const supplementalText = day.nationalHolidayName
    ? day.nationalHolidayName
    : formatJapaneseDate(labelDate, weekdayNumber);

  return {
    dateLabel: labelDate,
    dateTextColor: accentColor,
    weekdayLabel,
    weekdayTextColor: accentColor,
    weekdayNumber,
    calendarSupplementalText: supplementalText,
  };
}

function determineAccentColor(day: CalendarDay | null, weekdayNumber: number): AccentColor {
  const isNationalHoliday = Boolean(day?.nationalHolidayName && day.nationalHolidayName.length > 0);

  if (isNationalHoliday) {
    return 'holiday';
  }

  if (weekdayNumber === 0) {
    return 'holiday';
  }

  if (weekdayNumber === 6) {
    return 'saturday';
  }

  return 'default';
}

function formatJapaneseDate(dateId: string, weekdayNumber: number): string {
  const [year, month, day] = dateId.split('-');
  const weekdayJa = WEEKDAY_LABEL_JA[weekdayNumber] ?? '-';
  if (!year || !month || !day) {
    return dateId;
  }
  return `${year}年${Number(month)}月${Number(day)}日(${weekdayJa})`;
}

function resolveTermForDay(
  day: CalendarDay | null,
  terms: CalendarTerm[],
): CalendarTerm | null {
  if (!day) {
    return null;
  }

  if (day.termId) {
    const byId = terms.find((term) => term.id === day.termId);
    if (byId) {
      return byId;
    }
  }

  if (day.termName) {
    const byName = terms.find((term) => term.name === day.termName);
    if (byName) {
      return byName;
    }
  }

  return null;
}

function computeAcademicDisplay(
  day: CalendarDay | null,
  term: CalendarTerm | null,
  actualWeekday: number,
  parsedDate: Date,
  options: CalendarDisplayOptions,
): CalendarAcademicDisplay {
  if (!day) {
    return DEFAULT_ACADEMIC_DISPLAY;
  }

  const hasSaturdayClasses = options.hasSaturdayClasses ?? true;
  const normalizedType = normalizeDayType(day.type);
  const backgroundColor = determineBackgroundColor(
    normalizedType,
    actualWeekday,
    hasSaturdayClasses,
  );
  const resolvedWeekdayNumber = resolveClassWeekday(day, actualWeekday);
  const suppressClassDetails = shouldSuppressClassDetails(
    normalizedType,
    actualWeekday,
    hasSaturdayClasses,
  );
  const weekdayNumber = suppressClassDetails ? null : resolvedWeekdayNumber;
  const weekdayLabel =
    suppressClassDetails || typeof resolvedWeekdayNumber !== 'number'
      ? null
      : WEEKDAY_LABEL_JA[resolvedWeekdayNumber];
  const classOrder =
    suppressClassDetails || typeof day.classOrder !== 'number' ? null : day.classOrder;

  const label = computeAcademicLabel({
    normalizedType,
    day,
    term,
    weekdayLabel,
    classOrder,
    suppressClassDetails,
  });

  const subLabel = computeAcademicSubLabel({
    normalizedType,
    day,
    actualWeekday,
    weekdayNumber,
  });

  return {
    label,
    weekdayNumber,
    weekdayLabel,
    classOrder,
    backgroundColor,
    subLabel,
  };
}

function normalizeDayType(type?: string | null): NormalizedDayType {
  if (!type) {
    return 'other';
  }

  const lowered = type.toLowerCase();
  if (
    [
      'class',
      'class_day',
      'classday',
      '授業日',
      '授業',
      'lesson',
      'lecture',
      '通常授業',
    ].some((value) => lowered.includes(value))
  ) {
    return 'class';
  }
  if (
    ['holiday', '休講日', '休講', 'cancelled', 'canceled', '休講日特別'].some((value) =>
      lowered.includes(value),
    )
  ) {
    return 'holiday';
  }
  if (
    ['exam', '試験', '試験日', 'test'].some((value) =>
      lowered.includes(value),
    )
  ) {
    return 'exam';
  }
  if (
    ['reserve', '予備日', 'makeup', '補講予備'].some((value) =>
      lowered.includes(value),
    )
  ) {
    return 'reserve';
  }
  return 'other';
}

function determineBackgroundColor(
  normalizedType: NormalizedDayType,
  actualWeekday: number,
  hasSaturdayClasses: boolean,
): BackgroundColorType {
  if (actualWeekday === 0) {
    return 'sunday';
  }

  if (actualWeekday === 6 && !hasSaturdayClasses) {
    return 'sunday';
  }

  switch (normalizedType) {
    case 'holiday':
      return 'holiday';
    case 'exam':
      return 'exam';
    case 'reserve':
      return 'reserve';
    default:
      return 'none';
  }
}

function resolveClassWeekday(day: CalendarDay, actualWeekday: number): number | null {
  if (typeof day.classWeekday === 'number') {
    return clampWeekday(day.classWeekday);
  }

  return clampWeekday(actualWeekday);
}

function clampWeekday(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 6) {
    return 6;
  }
  return value;
}

function computeAcademicLabel({
  normalizedType,
  day,
  term,
  weekdayLabel,
  classOrder,
  suppressClassDetails,
}: {
  normalizedType: NormalizedDayType;
  day: CalendarDay;
  term: CalendarTerm | null;
  weekdayLabel: string | null;
  classOrder: number | null;
  suppressClassDetails: boolean;
}): string {
  const termName = term?.name ?? day.termName ?? '-';
  const shortName = term?.shortName ?? day.termShortName ?? termName;
  const termHolidayFlag = term?.holidayFlag ?? (term?.isHoliday ? 1 : undefined);

  if (termHolidayFlag === 1) {
    return termName;
  }

  if (normalizedType === 'exam') {
    return `${termName} 試験`;
  }
  if (normalizedType === 'holiday') {
    return `${termName} 休講日`;
  }
  if (normalizedType === 'reserve') {
    return `${termName} 予備日`;
  }

  if (normalizedType === 'class') {
    return shortName;
  }

  return termName;
}

function shouldSuppressClassDetails(
  normalizedType: NormalizedDayType,
  actualWeekday: number,
  hasSaturdayClasses: boolean,
): boolean {
  if (normalizedType !== 'class') {
    return false;
  }
  if (actualWeekday === 0) {
    return true;
  }
  if (actualWeekday === 6 && !hasSaturdayClasses) {
    return true;
  }
  return false;
}

function computeAcademicSubLabel({
  normalizedType,
  day,
  actualWeekday,
  weekdayNumber,
}: {
  normalizedType: NormalizedDayType;
  day: CalendarDay;
  actualWeekday: number;
  weekdayNumber: number | null;
}): string | null {
  const description =
    typeof day.description === 'string' && day.description.length > 0
      ? day.description
      : undefined;

  if (normalizedType === 'class' && day.isHoliday) {
    return description ?? '特別授業日';
  }

  if (normalizedType === 'holiday' && day.isHoliday === false) {
    return description ?? '特別休講日';
  }

  if (
    normalizedType === 'class' &&
    typeof day.classWeekday === 'number' &&
    weekdayNumber !== null &&
    weekdayNumber !== clampWeekday(actualWeekday)
  ) {
    return description ?? '曜日振替授業日';
  }

  return null;
}
