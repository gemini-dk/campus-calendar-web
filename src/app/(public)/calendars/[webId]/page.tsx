import type { Metadata } from "next";
import { notFound } from "next/navigation";

import UniversityCalendarContent from "./_components/UniversityCalendarContent";
import { getUniversityByWebId, listUniversityCalendars } from "@/lib/data/service/university.service";
import { extractSchoolColor } from "@/lib/university-color";

const FISCAL_YEARS = ["2025", "2026"] as const;
const DEFAULT_FISCAL_YEAR = FISCAL_YEARS[0];

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ webId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { webId } = await params;
  const university = await getUniversityByWebId(webId);
  if (!university) {
    return {
      title: `${webId} | ${DEFAULT_FISCAL_YEAR}年度 学事予定`,
    };
  }
  return {
    title: `${university.name} ${DEFAULT_FISCAL_YEAR}年度 授業日程`,
    description: `${university.name}の${DEFAULT_FISCAL_YEAR}年度学事予定（授業開始日、試験期間、休業日など）を掲載しています。春学期・秋学期のスケジュールを確認できます。`,
  };
}

export default async function Page({ params }: PageProps) {
  const { webId } = await params;
  const university = await getUniversityByWebId(webId);
  if (!university) {
    notFound();
  }

  const calendarEntries = await Promise.all(
    FISCAL_YEARS.map(async (fiscalYear) => {
      const calendars = await listUniversityCalendars(university, fiscalYear);
      return [fiscalYear, calendars] as const;
    }),
  );
  const calendarsByFiscalYear = Object.fromEntries(calendarEntries);
  const schoolColor = extractSchoolColor(university);
  const accentColor = schoolColor
    ? `rgb(${schoolColor.r}, ${schoolColor.g}, ${schoolColor.b})`
    : "#1d4ed8";

  return (
    <main className="relative flex min-h-full w-full flex-1 flex-col bg-neutral-100 pb-40">
      <div className="flex w-full flex-col gap-8 px-4 py-12 xl:flex-row xl:items-start xl:justify-center xl:gap-10 xl:px-8">
        <div className="flex w-full flex-1 justify-center xl:justify-center">
          <div className="flex w-full max-w-5xl flex-col gap-8">
            <header className="flex w-full flex-col gap-4">
              <h1 className="relative inline-block text-3xl font-bold text-neutral-900">
                {`${university.name} 授業日程`}
                <span
                  className="absolute -bottom-2 left-0 block h-1.5 w-full rounded-full"
                  style={{
                    backgroundColor: accentColor,
                  }}
                  aria-hidden
                />
              </h1>
            </header>
            <UniversityCalendarContent
              fiscalYears={FISCAL_YEARS}
              defaultFiscalYear={DEFAULT_FISCAL_YEAR}
              calendarsByFiscalYear={calendarsByFiscalYear}
            />
          </div>
        </div>
        <aside className="hidden w-[300px] flex-shrink-0 xl:block">
          <div className="flex h-full min-h-[400px] w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white text-sm text-neutral-500">
            広告枠
          </div>
        </aside>
      </div>
    </main>
  );
}
