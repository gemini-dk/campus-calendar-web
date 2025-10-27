import { getCalendarDay, listCalendarTerms } from "../repository/calendar.repository";
import type {
  CalendarAcademicDisplay,
  CalendarDisplayInfo,
  CalendarDisplayOptions,
  CalendarGeneralDisplay,
} from "./calendarDisplay.shared";
import { computeCalendarDisplayInfo } from "./calendarDisplay.shared";

export type {
  AccentColor,
  BackgroundColorType,
  CalendarAcademicDisplay,
  CalendarDisplayInfo,
  CalendarDisplayOptions,
  CalendarGeneralDisplay,
} from "./calendarDisplay.shared";

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

  return computeCalendarDisplayInfo(dateId, day, terms, options);
}
