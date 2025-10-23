import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import UniversityCalendarContent from "./_components/UniversityCalendarContent";
import { getUniversityByWebId, listUniversityCalendars } from "@/lib/data/service/university.service";

const FISCAL_YEAR = "2025";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { webId: string };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const university = await getUniversityByWebId(params.webId);
  if (!university) {
    return {
      title: `${params.webId} | 2025年度 学事予定`,
    };
  }
  return {
    title: `${university.name} ${FISCAL_YEAR}年度 学事予定・授業日程`,
    description: `${university.name}の${FISCAL_YEAR}年度学事予定（授業開始日、試験期間、休業日など）を掲載しています。春学期・秋学期のスケジュールを確認できます。`,
  };
}

export default async function Page({ params }: PageProps) {
  const university = await getUniversityByWebId(params.webId);
  if (!university) {
    notFound();
  }

  const calendars = await listUniversityCalendars(university, FISCAL_YEAR);

  return (
    <main className="min-h-screen w-full bg-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
        <header className="flex w-full flex-col gap-4">
          <h1 className="text-3xl font-bold text-neutral-900">{`${university.name} ${FISCAL_YEAR}年度 学事予定・授業日程`}</h1>
          {university.homepageUrl ? (
            <Link
              href={university.homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm font-semibold text-blue-600 hover:underline"
            >
              大学公式サイトを見る
            </Link>
          ) : null}
        </header>
        <UniversityCalendarContent fiscalYear={FISCAL_YEAR} calendars={calendars} />
      </div>
    </main>
  );
}
