import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { listUniversities } from '@/lib/data/service/university.service';
import {
  getPrefectureBySlug,
  listPrefectureSlugs,
  matchesPrefecture,
  type PrefectureDefinition,
} from '@/lib/prefectures';
import { UniversityCardGrid, type UniversityWithColor } from '../../_components/university-grid';
import GlobalFooter from '@/components/ui/GlobalFooter';

export const dynamic = 'force-dynamic';

type PrefecturePageProps = {
  params: {
    prefecture: string;
  };
};

function buildDescription(prefecture: PrefectureDefinition): string {
  return `${prefecture.name}に所在する大学の学事予定を一覧で確認できます。各大学のページから公開カレンダーへアクセスしましょう。`;
}

export async function generateStaticParams() {
  return listPrefectureSlugs().map((slug) => ({ prefecture: slug }));
}

export async function generateMetadata({ params }: PrefecturePageProps): Promise<Metadata> {
  const prefecture = getPrefectureBySlug(params.prefecture);
  if (!prefecture) {
    return {
      title: '都道府県別大学一覧 | 全国大学別 学事予定まとめ',
    } satisfies Metadata;
  }

  return {
    title: `${prefecture.name}の大学一覧 | 全国大学別 学事予定まとめ`,
    description: buildDescription(prefecture),
  } satisfies Metadata;
}

export default async function PrefecturePage({ params }: PrefecturePageProps) {
  const prefecture = getPrefectureBySlug(params.prefecture);
  if (!prefecture) {
    notFound();
  }

  const universities = await listUniversities();
  const filtered = universities
    .filter((university) => matchesPrefecture(university.prefecture, prefecture))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja')) as UniversityWithColor[];

  return (
    <main className="relative flex min-h-screen w-full flex-1 flex-col bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="flex w-full min-[1024px]:pr-0">
        <div className="flex w-full justify-center px-4 py-12 min-[1024px]:pr-[300px]">
          <div className="w-full max-w-[724px] min-[1280px]:max-w-[980px] 2xl:max-w-[1236px]">
            <section className="flex w-full flex-col gap-6 rounded-3xl border border-blue-200/60 bg-white p-10 text-slate-900 shadow-[0_24px_60px_rgba(148,163,184,0.25)]">
              <div className="flex w-full flex-col gap-3">
                <span className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">Area</span>
                <h1 className="text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
                  {prefecture.name}の大学一覧
                </h1>
                <p className="text-sm leading-relaxed text-slate-600 md:text-base">{buildDescription(prefecture)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-blue-600">
                <Link
                  href="/area"
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold transition hover:border-blue-300 hover:bg-blue-100"
                >
                  ← 都道府県一覧に戻る
                </Link>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                  掲載大学 {filtered.length} 校
                </span>
              </div>
            </section>

            <div className="mt-12 w-full">
              {filtered.length === 0 ? (
                <div className="flex h-52 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-center">
                  <p className="text-sm font-medium text-slate-700">
                    現在、{prefecture.name}に掲載中の大学はありません。
                  </p>
                  <p className="text-xs text-slate-500">掲載リクエストはお問い合わせフォームからご連絡ください。</p>
                </div>
              ) : (
                <UniversityCardGrid universities={filtered} />
              )}
            </div>
          </div>
        </div>
        <aside className="hidden fixed right-0 top-0 w-[300px] h-full flex-col min-[1024px]:flex z-10 overflow-y-auto">
          <div className="flex h-full w-full items-center justify-center border-l border-neutral-300 bg-white text-sm text-neutral-500">
            広告枠
            <br />
            <br />
            ここに表示する広告を募集中です。
          </div>
        </aside>
      </div>
      <GlobalFooter />
    </main>
  );
}
