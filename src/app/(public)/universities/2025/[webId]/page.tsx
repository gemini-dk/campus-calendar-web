import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import UniversityCalendarContent from "./_components/UniversityCalendarContent";
import AppInstallFooter from "./_components/AppInstallFooter";
import { getUniversityByWebId, listUniversityCalendars } from "@/lib/data/service/university.service";
import { extractSchoolColor } from "@/lib/university-color";

const FISCAL_YEAR = "2025";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ webId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { webId } = await params;
  const university = await getUniversityByWebId(webId);
  if (!university) {
    return {
      title: `${webId} | 2025年度 学事予定`,
    };
  }
  return {
    title: `${university.name} ${FISCAL_YEAR}年度 学事予定・授業日程`,
    description: `${university.name}の${FISCAL_YEAR}年度学事予定（授業開始日、試験期間、休業日など）を掲載しています。春学期・秋学期のスケジュールを確認できます。`,
  };
}

export default async function Page({ params }: PageProps) {
  const { webId } = await params;
  const university = await getUniversityByWebId(webId);
  if (!university) {
    notFound();
  }

  const calendars = await listUniversityCalendars(university, FISCAL_YEAR);
  const schoolColor = extractSchoolColor(university);
  const accentColor = schoolColor
    ? `rgb(${schoolColor.r}, ${schoolColor.g}, ${schoolColor.b})`
    : "#1d4ed8";

  return (
    <main className="relative min-h-screen w-full bg-neutral-100 pb-40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
        <header className="flex w-full flex-col gap-4">
          <h1 className="relative inline-block text-3xl font-bold text-neutral-900">
            {`${university.name} ${FISCAL_YEAR}年度 学事予定・授業日程`}
            <span
              className="absolute -bottom-2 left-0 block h-1.5 w-full rounded-full"
              style={{
                backgroundColor: accentColor,
              }}
              aria-hidden
            />
          </h1>
          {university.homepageUrl ? (
            <Link
              href={university.homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm font-semibold text-blue-600 underline-offset-4 transition hover:text-blue-700 hover:underline"
            >
              大学公式サイトを見る
            </Link>
          ) : null}
        </header>
        <UniversityCalendarContent fiscalYear={FISCAL_YEAR} calendars={calendars} />
      </div>
      <AppInstallFooter />
    </main>
  );
}
