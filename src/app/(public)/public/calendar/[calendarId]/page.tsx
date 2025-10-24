import PublicCalendarView from "../_components/PublicCalendarView";

type PageProps = {
  params: { calendarId: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

export const dynamic = "force-dynamic";

export default function Page({ params, searchParams }: PageProps) {
  const rawYear = searchParams.year;
  const rawMonth = searchParams.month;

  const fiscalYear = typeof rawYear === "string" ? rawYear : "";
  const month = typeof rawMonth === "string" ? Number(rawMonth) : NaN;

  return (
    <PublicCalendarView
      calendarId={params.calendarId}
      fiscalYear={fiscalYear}
      initialMonth={Number.isFinite(month) ? month : null}
    />
  );
}
