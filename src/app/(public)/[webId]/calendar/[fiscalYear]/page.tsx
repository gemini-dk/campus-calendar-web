import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import UniversityCalendarContent from "../_components/UniversityCalendarContent";
import { DEFAULT_FISCAL_YEAR, FISCAL_YEARS, type FiscalYear } from "@/lib/constants/fiscal-year";
import { getCalendarDays, getCalendarTerms } from "@/lib/data/service/calendar.service";
import { getUniversityByWebId, listUniversities, listUniversityCalendars } from "@/lib/data/service/university.service";
import { buildUniversityCalendarCanonicalUrl, buildUniversityCalendarYearUrl } from "@/lib/site-url";
import { extractSchoolColor } from "@/lib/university-color";
import type { CalendarDay, CalendarTerm } from "@/lib/data/schema/calendar";
import type { UniversityCalendar } from "@/lib/data/schema/university";

const KEYWORD_VARIANTS = [
  "学事予定",
  "授業日程",
  "学年暦",
  "年間スケジュール",
  "授業計画",
  "講義カレンダー",
] as const;

type PageParams = { webId: string; fiscalYear: string };

type PageProps = {
  params: PageParams;
};

type PrefetchedUniversityCalendar = UniversityCalendar & {
  calendarDays: CalendarDay[];
  calendarTerms: CalendarTerm[];
};

const WEEKDAY_LABELS: Record<number, string> = {
  1: "月曜",
  2: "火曜",
  3: "水曜",
  4: "木曜",
  5: "金曜",
  6: "土曜",
  7: "日曜",
};

function normalizeUniversityTextList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value): value is string => value.length > 0);
}

function summarizeList(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }
  if (values.length <= 3) {
    return values.join("・");
  }
  return `${values.slice(0, 3).join("・")} など`;
}

function toFiscalYear(value: string): FiscalYear | null {
  return FISCAL_YEARS.find((year) => year === value) ?? null;
}

function normalizeTermLookupKey(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildTermLookup(terms: CalendarTerm[]) {
  const byId = new Map<string, CalendarTerm>();
  const byName = new Map<string, CalendarTerm>();
  terms.forEach((term) => {
    byId.set(term.id, term);
    const normalizedName = normalizeTermLookupKey(term.name);
    if (normalizedName) {
      byName.set(normalizedName, term);
    }
    const normalizedShortName = normalizeTermLookupKey(term.shortName);
    if (normalizedShortName) {
      byName.set(normalizedShortName, term);
    }
  });
  return { byId, byName } as const;
}

function resolveTermForDay(day: CalendarDay, lookup: ReturnType<typeof buildTermLookup>): CalendarTerm | null {
  if (day.termId && lookup.byId.has(day.termId)) {
    return lookup.byId.get(day.termId) ?? null;
  }
  const normalizedTermName = normalizeTermLookupKey(day.termName ?? day.termShortName);
  if (normalizedTermName && lookup.byName.has(normalizedTermName)) {
    return lookup.byName.get(normalizedTermName) ?? null;
  }
  return null;
}

function toWeekdayNumberFromIso(date: string | undefined): number | null {
  if (!date) {
    return null;
  }
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return ((parsed.getDay() + 6) % 7) + 1;
}

function formatClassScheduleLabel(day: CalendarDay): string | null {
  const weekdayNumber = day.classWeekday ?? toWeekdayNumberFromIso(day.date ?? undefined);
  const weekdayLabel = weekdayNumber ? WEEKDAY_LABELS[weekdayNumber] : undefined;
  if (!weekdayLabel) {
    return null;
  }
  const classOrder = day.classOrder;
  if (typeof classOrder === "number" && Number.isFinite(classOrder)) {
    return `${weekdayLabel}授業(${classOrder})`;
  }
  return `${weekdayLabel}授業`;
}

function joinSegments(...segments: (string | null | undefined)[]): string {
  return segments
    .map((segment) => (typeof segment === "string" ? segment.trim() : ""))
    .filter((segment) => segment.length > 0)
    .join(" ");
}

function buildAiSuggestionLine(day: CalendarDay, term: CalendarTerm | null): string | null {
  const isoDate = day.date;
  if (!isoDate) {
    return null;
  }

  const termName = normalizeTermLookupKey(term?.name ?? day.termName ?? day.termShortName) ?? "";
  const isHolidayTerm = term?.holidayFlag === 1;
  if (isHolidayTerm) {
    return joinSegments(`${isoDate}:授業なし`, termName);
  }

  const type = day.type ?? "";
  if (type === "休講日") {
    return joinSegments(`${isoDate}:授業なし`, termName);
  }
  if (type === "試験日") {
    return joinSegments(`${isoDate}:試験日`, termName);
  }
  if (type === "予備日") {
    return joinSegments(`${isoDate}:予備日・補講日`, termName);
  }
  if (type === "授業日") {
    const classLabel = formatClassScheduleLabel(day);
    return joinSegments(`${isoDate}:授業あり`, termName, classLabel);
  }

  if (type === "休業日" || type === "長期休暇") {
    return joinSegments(`${isoDate}:授業なし`, termName);
  }

  if (termName) {
    return joinSegments(`${isoDate}:授業日程`, termName);
  }

  return `${isoDate}:授業日程`;
}

function buildAiSuggestionComment(
  calendar: PrefetchedUniversityCalendar,
  calendarCount: number,
): string | null {
  const lookup = buildTermLookup(calendar.calendarTerms);
  const lines = calendar.calendarDays
    .map((day) => buildAiSuggestionLine(day, resolveTermForDay(day, lookup)))
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  const headerSuffix = calendarCount > 1 ? `（${calendar.name}）` : "";
  const header = `大学公式情報から取得した授業日程を表示しています。${headerSuffix}`;
  const body = lines.map((line) => `- ${line}`).join("\n");
  return `<!-- ${header}\n${body}\n-->`;
}

export async function generateStaticParams() {
  const universities = await listUniversities();
  return universities.flatMap((university) =>
    FISCAL_YEARS.map((fiscalYear) => ({
      webId: university.webId,
      fiscalYear,
    })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { webId, fiscalYear: rawFiscalYear } = params;
  const fiscalYear = toFiscalYear(rawFiscalYear) ?? DEFAULT_FISCAL_YEAR;
  const canonicalUrl = buildUniversityCalendarCanonicalUrl(webId);
  const yearUrl = buildUniversityCalendarYearUrl(webId, fiscalYear);
  const university = await getUniversityByWebId(webId);
  if (!university) {
    return {
      title: `${webId} | ${fiscalYear}年度 学事予定`,
      alternates: {
        canonical: canonicalUrl,
        languages: {
          "x-default": canonicalUrl,
        },
      },
      openGraph: {
        url: yearUrl,
      },
    };
  }
  const faculties = normalizeUniversityTextList(university.faculties);
  const campuses = normalizeUniversityTextList(university.campuses);
  const facultiesSummary = summarizeList(faculties);
  const campusesSummary = summarizeList(campuses);
  const descriptionSegments = [
    `${university.name}の${fiscalYear}年度学事予定（授業開始日、試験期間、休業日など）を掲載しています。春学期・秋学期のスケジュールを確認できます。`,
  ];
  if (facultiesSummary) {
    descriptionSegments.push(`${university.name}の${facultiesSummary}学部の授業日程にも対応しています。`);
  }
  if (campusesSummary) {
    descriptionSegments.push(`${campusesSummary}キャンパスの学事予定を確認できます。`);
  }
  const keywordsSet = new Set<string>([
    ...KEYWORD_VARIANTS.map((variant) => `${university.name} ${variant}`),
    ...KEYWORD_VARIANTS,
    ...faculties.map((faculty) => `${university.name} ${faculty}`),
    ...faculties,
    ...campuses.map((campus) => `${university.name} ${campus}`),
    ...campuses,
  ]);
  const description = descriptionSegments.join(" ");

  return {
    title: `${university.name} ${fiscalYear}年度 授業日程`,
    description,
    keywords: Array.from(keywordsSet),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "x-default": canonicalUrl,
      },
    },
    openGraph: {
      url: yearUrl,
      title: `${university.name} ${fiscalYear}年度 授業日程`,
      description,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { webId, fiscalYear: rawFiscalYear } = params;
  const fiscalYear = toFiscalYear(rawFiscalYear);
  if (!fiscalYear) {
    redirect(`/${encodeURIComponent(webId)}/calendar/${DEFAULT_FISCAL_YEAR}`);
  }

  const university = await getUniversityByWebId(webId);
  if (!university) {
    notFound();
  }

  const canonicalUrl = buildUniversityCalendarCanonicalUrl(webId);
  const faculties = normalizeUniversityTextList(university.faculties);
  const campuses = normalizeUniversityTextList(university.campuses);
  const calendarEntries = await Promise.all(
    FISCAL_YEARS.map(async (targetFiscalYear) => {
      const calendars = await listUniversityCalendars(university, targetFiscalYear);
      const calendarsWithData = await Promise.all(
        calendars.map(async (calendar) => {
          const [days, terms] = await Promise.all([
            getCalendarDays(calendar.fiscalYear, calendar.calendarId),
            getCalendarTerms(calendar.fiscalYear, calendar.calendarId),
          ]);
          return {
            ...calendar,
            calendarDays: days,
            calendarTerms: terms,
          };
        }),
      );
      return [targetFiscalYear, calendarsWithData] as const;
    }),
  );
  const calendarsByFiscalYear = Object.fromEntries(calendarEntries);
  const schoolColor = extractSchoolColor(university);
  const homepageUrl = university.homepageUrl;
  const accentColor = schoolColor
    ? `rgb(${schoolColor.r}, ${schoolColor.g}, ${schoolColor.b})`
    : "#1d4ed8";
  const structuredDataKeywords = Array.from(
    new Set([
      ...KEYWORD_VARIANTS.map((variant) => `${university.name} ${variant}`),
      ...KEYWORD_VARIANTS,
      ...faculties,
      ...campuses,
    ]),
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollegeOrUniversity",
    name: university.name,
    url: canonicalUrl,
    ...(homepageUrl ? { sameAs: [homepageUrl] } : {}),
    ...(faculties.length > 0
      ? {
          department: faculties.map((faculty) => ({
            "@type": "EducationalOrganization",
            name: faculty,
          })),
        }
      : {}),
    ...(campuses.length > 0
      ? {
          hasPart: campuses.map((campus) => ({
            "@type": "Campus",
            name: campus,
          })),
        }
      : {}),
    keywords: structuredDataKeywords.join(", "),
  } as const;
  const structuredDataJson = JSON.stringify(structuredData).replace(/</g, "\\u003c");

  const contentHorizontalPadding = "px-4 sm:px-6 min-[1024px]:px-[30px]";
  const calendarsForActiveFiscalYear = calendarsByFiscalYear[fiscalYear] ?? [];
  const aiSuggestionComments = calendarsForActiveFiscalYear
    .map((calendar) => ({
      id: calendar.id,
      comment: buildAiSuggestionComment(calendar, calendarsForActiveFiscalYear.length),
    }))
    .filter((item): item is { id: string; comment: string } => Boolean(item.comment));

  return (
    <main className="relative flex min-h-screen w-full flex-1 flex-col bg-neutral-100 pb-40">
      <div className="flex w-full min-[1024px]:pr-0">
        <div className="flex w-full justify-center py-12 min-[1024px]:pr-[300px]">
          <div className="w-full max-w-[724px] min-[1280px]:max-w-[980px] 2xl:max-w-[1236px]">
            <div className="flex w-full flex-col gap-8">
              <div className={contentHorizontalPadding}>
                <header className="flex w-full flex-col gap-4">
                  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson }} />
                  {aiSuggestionComments.map(({ id, comment }) => (
                    <div
                      key={`ai-suggestion-${id}`}
                      hidden
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: comment }}
                    />
                  ))}
                  <div className="flex w-full justify-end gap-3">
                    {FISCAL_YEARS.map((year) => {
                      const isActive = year === fiscalYear;
                      return (
                        <Link
                          key={year}
                          href={`/${encodeURIComponent(webId)}/calendar/${encodeURIComponent(year)}`}
                          aria-current={isActive ? "page" : undefined}
                          className={`text-sm font-semibold transition ${
                            isActive
                              ? "cursor-default text-neutral-500 pointer-events-none"
                              : "text-blue-600 underline underline-offset-4 hover:text-blue-700 focus-visible:text-blue-700"
                          }`}
                        >
                          {year}年度
                        </Link>
                      );
                    })}
                </div>
                <h1 className="relative flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-3xl font-bold text-neutral-900">
                  <span className="whitespace-nowrap">{`${fiscalYear}年度 ${university.name}`}</span>
                  <span className="whitespace-nowrap">学事予定・授業日程</span>
                  <span
                    className="pointer-events-none absolute -bottom-2 left-0 block h-1.5 w-full rounded-full"
                    style={{
                      backgroundColor: accentColor,
                    }}
                    aria-hidden
                  />
                </h1>
                <p className="mt-2 text-base leading-relaxed text-neutral-700">
                  {`${university.name}の${fiscalYear}年度学事予定では、`}
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
                  {`また、大学の授業日程を反映したカレンダーアプリも提供しています。今日何の授業があるか、スマホでいつでも確認できます。`}
                </p>
              </header>
              </div>
              <UniversityCalendarContent
                activeFiscalYear={fiscalYear}
                calendarsByFiscalYear={calendarsByFiscalYear}
                webId={webId}
                universityName={university.name}
                horizontalPaddingClassName={contentHorizontalPadding}
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
