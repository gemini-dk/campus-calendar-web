import PublicCalendarView from "../_components/PublicCalendarView";
import { getCalendarDays, getCalendarTerms } from "@/lib/data/service/calendar.service";
import type { CalendarDay, CalendarTerm } from "@/lib/data/schema/calendar";

type PageProps = {
  params: { calendarId: string };
  searchParams: { [key: string]: string | string[] | undefined };
};


function parseBooleanLike(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return undefined;
}

export default async function Page({ params, searchParams }: PageProps) {
  const rawYear = searchParams.year;
  const rawMonth = searchParams.month;
  const rawHasSaturdayClasses = searchParams.hasSaturdayClasses;

  const fiscalYear = typeof rawYear === "string" ? rawYear : "";
  const month = typeof rawMonth === "string" ? Number(rawMonth) : NaN;
  const hasSaturdayClassesParam = Array.isArray(rawHasSaturdayClasses)
    ? rawHasSaturdayClasses[0]
    : rawHasSaturdayClasses;
  const hasSaturdayClasses = parseBooleanLike(typeof hasSaturdayClassesParam === "string" ? hasSaturdayClassesParam : undefined);

  let days: CalendarDay[] = [];
  let terms: CalendarTerm[] = [];

  if (fiscalYear.trim().length > 0) {
    [days, terms] = await Promise.all([
      getCalendarDays(fiscalYear, params.calendarId),
      getCalendarTerms(fiscalYear, params.calendarId),
    ]);
  }

  return (
    <PublicCalendarView
      dataset={{
        fiscalYear,
        calendarId: params.calendarId,
        hasSaturdayClasses,
        days,
        terms,
      }}
      initialMonth={Number.isFinite(month) ? month : null}
    />
  );
}
