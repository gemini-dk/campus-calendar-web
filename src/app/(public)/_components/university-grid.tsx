'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { University } from '@/lib/data/schema/university';
import {
  createUniversityCardAccentStyles,
  extractSchoolColor,
  type SchoolColor,
} from '@/lib/university-color';
import { getCalendarHref } from '@/lib/calendar-url';

type UniversityWithColor = University & {
  colorRgb?: {
    r?: number;
    g?: number;
    b?: number;
  };
  furigana?: string;
};

function createAccentStyles(color: SchoolColor | null) {
  return createUniversityCardAccentStyles(color);
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function SearchableUniversityGrid({
  universities,
  limit,
}: {
  universities: UniversityWithColor[];
  limit?: number;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const router = useRouter();

  const filteredUniversities = useMemo(() => {
    const normalizedLimit = typeof limit === 'number' && Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : null;
    if (!normalizedQuery) {
      if (normalizedLimit !== null) {
        return universities.slice(0, normalizedLimit);
      }
      return universities;
    }
    return universities.filter((university) => {
      const targets: string[] = [
        normalize(university.name),
        normalize(university.furigana),
      ];
      return targets.some((target) => target.toLowerCase().includes(normalizedQuery));
    });
  }, [universities, normalizedQuery, limit]);

  const totalMatches = useMemo(() => {
    if (!normalizedQuery) {
      return typeof limit === 'number' ? Math.min(universities.length, Math.max(0, Math.floor(limit))) : universities.length;
    }
    return universities.filter((university) => {
      const targets: string[] = [
        normalize(university.name),
        normalize(university.furigana),
      ];
      return targets.some((target) => target.toLowerCase().includes(normalizedQuery));
    }).length;
  }, [universities, normalizedQuery, limit]);

  return (
    <section className="flex w-full flex-col gap-10">
      <div className="flex w-full flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_48px_rgba(148,163,184,0.25)]">
        <div className="flex w-full flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-500">Search</span>
          <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">大学を検索する</h2>
          <p className="text-sm text-slate-600">大学名・ふりがなで絞り込めます。気になる大学の学事予定を素早く探しましょう。</p>
        </div>
        <div className="relative flex h-16 w-full items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="大学名で検索"
            aria-label="大学名で検索"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-6 text-base text-slate-900 shadow-inner transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            type="search"
          />
        </div>
        <span className="text-xs font-medium text-slate-500">
          該当大学 {totalMatches} 校 / 全 {universities.length} 校
        </span>
      </div>

      {filteredUniversities.length === 0 ? (
        <div className="flex h-52 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-center">
          <p className="text-sm font-medium text-slate-700">条件に合致する大学が見つかりませんでした。</p>
          <p className="text-xs text-slate-500">検索条件を変更するか、大学名のスペルをご確認ください。</p>
        </div>
      ) : (
        <ul className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredUniversities.map((university) => {
            const color = extractSchoolColor(university);
            const accent = createAccentStyles(color);
            const scheduleHref = getCalendarHref(university.webId);

            return (
              <li key={university.id} className="h-full w-full">
                <article
                  className="flex h-full w-full cursor-pointer flex-col gap-4 rounded-3xl border bg-white p-6 text-slate-900 transition hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(148,163,184,0.35)]"
                  style={{
                    borderColor: accent.borderColor,
                    background: accent.background,
                    boxShadow: accent.boxShadow,
                  }}
                  onClick={() => router.push(scheduleHref)}
                >
                  <div
                    className="h-1.5 w-full rounded-full"
                    style={{
                      background: accent.accentBar,
                    }}
                    aria-hidden
                  />

                  <div className="flex w-full flex-col gap-3">
                    <h3 className="text-lg font-semibold leading-tight text-slate-900">{university.name}</h3>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
