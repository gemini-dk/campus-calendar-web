import type { Metadata } from "next";
import { notFound } from "next/navigation";

import UniversityCalendarContent from "./_components/UniversityCalendarContent";
import { buildUniversityCalendarCanonicalUrl } from "@/lib/site-url";
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
  const canonicalUrl = buildUniversityCalendarCanonicalUrl(webId);
  const university = await getUniversityByWebId(webId);
  if (!university) {
    return {
      title: `${webId} | ${DEFAULT_FISCAL_YEAR}年度 学事予定`,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        url: canonicalUrl,
      },
    };
  }
  return {
    title: `${university.name} ${DEFAULT_FISCAL_YEAR}年度 授業日程`,
    description: `${university.name}の${DEFAULT_FISCAL_YEAR}年度学事予定（授業開始日、試験期間、休業日など）を掲載しています。春学期・秋学期のスケジュールを確認できます。`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      url: canonicalUrl,
    },
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
  const homepageUrl = university.homepageUrl;
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
                  {`${university.name} 学事予定・授業日程`}
                  <span
                    className="absolute -bottom-2 left-0 block h-1.5 w-full rounded-full"
                    style={{
                      backgroundColor: accentColor,
                    }}
                    aria-hidden
                  />
                </h1>
                <p className="mt-2 text-base leading-relaxed text-neutral-700">
                  {`${university.name}の${DEFAULT_FISCAL_YEAR}年度学事予定では、`}
                  {homepageUrl ? (
                    <a
                      href={homepageUrl}
                      className="text-blue-600 underline underline-offset-2"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      公式ページ
                    </a>
                  ) : (
                    "公式ページ"
                  )}
                  {`の情報を元に授業日程をわかりやすく整理しています。最も重要視しているのは授業の有無です。学期や長期休暇の日程だけではなく、祝日なのに授業が行われる特別授業日、平日なのに休講となる特別休講日、実際の曜日とは異なる曜日の授業が行われる振替授業日を一目で分かるカレンダー形式にまとめています。`}
                </p>
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
