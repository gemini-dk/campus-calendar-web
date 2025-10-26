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
    <main className="relative flex min-h-screen w-full flex-1 flex-col bg-neutral-100 pb-40">
      <div className="flex w-full min-[1024px]:pr-0">
        <div className="flex w-full justify-center py-12 min-[1024px]:pr-[300px]">
          <div className="w-full max-w-[724px] min-[1280px]:max-w-[980px] 2xl:max-w-[1236px]">
            <div className="flex w-full flex-col gap-8">
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
        </div>
        <aside className="hidden fixed right-0 top-0 w-[300px] h-full flex-col min-[1024px]:flex z-10 overflow-y-auto">
          <div className="flex h-full w-full items-center justify-center border-l border-neutral-300 bg-white text-sm text-neutral-500">
            広告枠
          </div>
        </aside>
      </div>
    </main>
  );
}
