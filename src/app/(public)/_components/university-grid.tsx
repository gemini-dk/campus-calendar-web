'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import type { University } from '@/lib/data/schema/university';

type UniversityWithColor = University & {
  colorRGB?: {
    R?: number;
    G?: number;
    B?: number;
  };
};

type SchoolColor = {
  R: number;
  G: number;
  B: number;
};

function extractSchoolColor(university: UniversityWithColor): SchoolColor | null {
  const raw = university.colorRGB;
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { R, G, B } = raw;
  if (
    typeof R === 'number'
    && Number.isFinite(R)
    && typeof G === 'number'
    && Number.isFinite(G)
    && typeof B === 'number'
    && Number.isFinite(B)
  ) {
    const clamp = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
    return {
      R: clamp(R),
      G: clamp(G),
      B: clamp(B),
    };
  }
  return null;
}

function createAccentStyles(color: SchoolColor | null) {
  if (!color) {
    return {
      borderColor: 'rgba(148, 163, 184, 0.4)',
      background: 'linear-gradient(135deg, rgba(240, 249, 255, 0.98), rgba(255, 255, 255, 0.94))',
      boxShadow: '0 18px 42px rgba(148, 163, 184, 0.25)',
      accentBar: 'linear-gradient(90deg, rgba(37, 99, 235, 0.55), rgba(96, 165, 250, 0.4))',
      buttonSolid: 'linear-gradient(135deg, rgba(37, 99, 235, 0.92), rgba(59, 130, 246, 0.78))',
      buttonOutline: 'rgba(148, 163, 184, 0.55)',
    } as const;
  }
  const { R, G, B } = color;
  const rgba = (alpha: number) => `rgba(${R}, ${G}, ${B}, ${alpha})`;
  return {
    borderColor: rgba(0.45),
    background: `linear-gradient(135deg, ${rgba(0.18)}, rgba(255, 255, 255, 0.94))`,
    boxShadow: `0 22px 46px ${rgba(0.2)}`,
    accentBar: `linear-gradient(90deg, ${rgba(0.65)}, ${rgba(0.32)})`,
    buttonSolid: `linear-gradient(135deg, ${rgba(0.9)}, ${rgba(0.7)})`,
    buttonOutline: rgba(0.4),
  } as const;
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function SearchableUniversityGrid({
  universities,
}: {
  universities: UniversityWithColor[];
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredUniversities = useMemo(() => {
    if (!normalizedQuery) {
      return universities;
    }
    return universities.filter((university) => {
      const targets: string[] = [
        normalize(university.name),
        normalize(university.shortName),
        normalize(university.prefecture),
        normalize(university.code),
      ];
      return targets.some((target) => target.toLowerCase().includes(normalizedQuery));
    });
  }, [universities, normalizedQuery]);

  return (
    <section className="flex w-full flex-col gap-10">
      <div className="flex w-full flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_48px_rgba(148,163,184,0.25)]">
        <div className="flex w-full flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-500">Search</span>
          <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">大学を検索する</h2>
          <p className="text-sm text-slate-600">大学名・略称・所在地で絞り込めます。気になる大学の学事予定を素早く探しましょう。</p>
        </div>
        <div className="relative flex h-16 w-full items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="大学名・所在地などで検索"
            aria-label="大学名や所在地で検索"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-6 text-base text-slate-900 shadow-inner transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            type="search"
          />
        </div>
        <span className="text-xs font-medium text-slate-500">
          該当大学 {filteredUniversities.length} 校 / 全 {universities.length} 校
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
            const homepageUrl = normalize(university.homepageUrl);

            return (
              <li key={university.id} className="h-full w-full">
                <article
                  className="flex h-full w-full flex-col gap-6 rounded-3xl border bg-white p-8 text-slate-900 transition hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(148,163,184,0.35)]"
                  style={{
                    borderColor: accent.borderColor,
                    background: accent.background,
                    boxShadow: accent.boxShadow,
                  }}
                >
                  <div className="flex w-full flex-col gap-5">
                    <div
                      className="h-1 w-full rounded-full"
                      style={{
                        background: accent.accentBar,
                      }}
                    />
                    <div className="flex w-full flex-col gap-2">
                      <h3 className="text-xl font-semibold leading-tight text-slate-900">{university.name}</h3>
                      {normalize(university.prefecture) ? (
                        <span className="text-xs font-medium text-slate-500">
                          {normalize(university.prefecture)}
                        </span>
                      ) : null}
                    </div>
                    {homepageUrl ? (
                      <Link
                        href={homepageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-fit text-sm font-medium text-blue-700 underline-offset-4 transition hover:text-blue-900 hover:underline"
                      >
                        公式サイトを開く
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">公式サイト情報は現在整備中です。</span>
                    )}
                  </div>
                  <div className="mt-auto flex w-full flex-col gap-3 sm:flex-row">
                    <Link
                      href={`/universities/2025/${encodeURIComponent(university.webId)}`}
                      className="flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-white transition hover:brightness-110 sm:w-1/2"
                      style={{
                        background: accent.buttonSolid,
                        boxShadow: color ? `0 18px 36px rgba(${color.R}, ${color.G}, ${color.B}, 0.25)` : '0 18px 36px rgba(37, 99, 235, 0.25)',
                      }}
                    >
                      学事予定を表示
                    </Link>
                    <button
                      type="button"
                      className="flex h-12 w-full items-center justify-center rounded-2xl border text-sm font-semibold text-slate-700 transition hover:border-blue-500 hover:text-blue-900 sm:w-1/2"
                      style={{ borderColor: accent.buttonOutline }}
                    >
                      リクエスト
                    </button>
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
