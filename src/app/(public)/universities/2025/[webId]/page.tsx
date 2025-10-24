import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import UniversityCalendarContent from "./_components/UniversityCalendarContent";
import { getUniversityByWebId, listUniversityCalendars } from "@/lib/data/service/university.service";
import {
  createUniversityHeroAccentStyles,
  extractSchoolColor,
} from "@/lib/university-color";

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
  const accent = createUniversityHeroAccentStyles(schoolColor);

  const detailBadges: string[] = [];
  if (typeof university.prefecture === "string" && university.prefecture.trim()) {
    detailBadges.push(university.prefecture.trim());
  }
  if (typeof university.shortName === "string" && university.shortName.trim()) {
    detailBadges.push(university.shortName.trim());
  }
  if (typeof university.type === "string" && university.type.trim()) {
    detailBadges.push(university.type.trim());
  }
  if (typeof university.capacity === "number" && Number.isFinite(university.capacity)) {
    const formatter = new Intl.NumberFormat("ja-JP");
    detailBadges.push(`学生数 ${formatter.format(Math.max(0, Math.round(university.capacity)))}`);
  }

  return (
    <main className="min-h-screen w-full bg-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
        <section className="flex w-full flex-col gap-6">
          <header
            className="relative flex w-full flex-col overflow-hidden rounded-3xl border"
            style={{
              background: accent.containerBackground,
              borderColor: accent.containerBorder,
              boxShadow: accent.containerShadow,
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-100"
              style={{
                background: accent.overlay,
              }}
              aria-hidden
            />
            <div className="relative z-10 flex w-full flex-col gap-6 px-6 py-10 text-white md:px-10">
              <span
                className="w-fit rounded-full px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.28em]"
                style={{
                  background: accent.badgeBackground,
                  color: accent.badgeColor,
                }}
              >
                University Calendar
              </span>
              <h1 className="text-3xl font-bold leading-tight text-white md:text-4xl">
                {`${university.name} ${FISCAL_YEAR}年度 学事予定・授業日程`}
              </h1>
              <p className="max-w-3xl text-sm leading-relaxed text-white/85 md:text-base">
                {`${university.name}の${FISCAL_YEAR}年度学事予定をもとに、`}
                <span
                  className="font-semibold"
                  style={{
                    color: accent.highlightColor,
                  }}
                >
                  授業開始日や試験期間、休業日
                </span>
                {`などの重要な日程を確認できます。`}
              </p>
              {detailBadges.length > 0 ? (
                <ul className="flex w-full flex-wrap gap-2">
                  {detailBadges.map((badge) => (
                    <li key={badge} className="h-full">
                      <span
                        className="inline-flex h-full min-h-9 items-center justify-center rounded-full px-4 text-xs font-medium tracking-wide text-white/90"
                        style={{
                          border: `1px solid ${accent.pillBorderColor}`,
                          background: "rgba(255, 255, 255, 0.08)",
                        }}
                      >
                        {badge}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {university.homepageUrl ? (
                <Link
                  href={university.homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 w-fit items-center justify-center rounded-full px-6 text-sm font-semibold text-white transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                  style={{
                    background: accent.buttonBackground,
                    color: accent.linkColor,
                    boxShadow: accent.buttonShadow,
                  }}
                >
                  大学公式サイトを見る
                </Link>
              ) : (
                <span className="text-xs font-medium text-white/70">公式サイト情報は登録されていません</span>
              )}
            </div>
            <div
              className="relative z-10 h-1.5 w-full"
              style={{
                background: accent.accentBar,
              }}
              aria-hidden
            />
          </header>
        </section>
        <section className="flex w-full flex-col gap-6 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex w-full flex-col gap-2">
            <h2 className="text-xl font-semibold text-neutral-900">{`${FISCAL_YEAR}年度 学事カレンダー`}</h2>
            <p className="text-sm text-neutral-600">
              {`${university.name}の公開カレンダーを選択すると、${FISCAL_YEAR}年度の授業日程や休業日がカレンダー形式で表示されます。`}
            </p>
          </div>
          <UniversityCalendarContent fiscalYear={FISCAL_YEAR} calendars={calendars} />
        </section>
      </div>
    </main>
  );
}
