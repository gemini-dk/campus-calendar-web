import Link from 'next/link';
import type { Metadata } from 'next';

import { listUniversities } from '@/lib/data/service/university.service';
import { PREFECTURES, matchesPrefecture } from '@/lib/prefectures';
import GlobalFooter from '@/components/ui/GlobalFooter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '都道府県から大学を探す | 全国大学別 学事予定まとめ',
  description:
    '全国47都道府県の大学を一覧から確認できます。気になる地域を選んで、各大学の学事予定ページへアクセスしましょう。',
};

export default async function AreaIndexPage() {
  const universities = await listUniversities();

  const universityCountBySlug = new Map<string, number>();
  universities.forEach((university) => {
    const matchedPrefecture = PREFECTURES.find((prefecture) =>
      matchesPrefecture(university.prefecture, prefecture),
    );
    if (!matchedPrefecture) {
      return;
    }
    universityCountBySlug.set(
      matchedPrefecture.slug,
      (universityCountBySlug.get(matchedPrefecture.slug) ?? 0) + 1,
    );
  });

  return (
    <main className="relative flex min-h-screen w-full flex-1 flex-col bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="flex w-full min-[1024px]:pr-0">
        <div className="flex w-full justify-center px-4 pt-12 min-[1024px]:pr-[300px]">
          <div className="w-full max-w-[724px] min-[1280px]:max-w-[980px] 2xl:max-w-[1236px]">
            <section className="flex w-full flex-col gap-6 rounded-3xl border border-blue-200/60 bg-white p-10 text-slate-900 shadow-[0_24px_60px_rgba(148,163,184,0.25)]">
              <div className="flex w-full flex-col gap-3">
                <span className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">Area</span>
                <h1 className="text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
                  都道府県から大学を探す
                </h1>
                <p className="text-sm leading-relaxed text-slate-600 md:text-base">
                  全国47都道府県ごとに、掲載している大学を一覧にまとめました。<br />
                  お住まいの地域や進学を検討しているエリアから大学をチェックできます。
                </p>
              </div>
              <p className="text-xs font-medium text-slate-500">
                各都道府県のリンクをクリックすると、その地域に属する大学一覧が表示されます。
              </p>
            </section>

            <div className="mt-12 w-full mb-12">
              <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {PREFECTURES.map((prefecture) => {
                  const count = universityCountBySlug.get(prefecture.slug) ?? 0;
                  return (
                    <Link
                      key={prefecture.slug}
                      href={`/area/${prefecture.slug}`}
                      className="flex h-full w-full flex-col gap-2 rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_24px_50px_rgba(148,163,184,0.28)]"
                      aria-label={`${prefecture.name}にある大学一覧ページへ移動`}
                    >
                      <span className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-500">
                        {prefecture.englishName}
                      </span>
                      <span className="text-xl font-semibold text-slate-900">{prefecture.name}</span>
                      <span className="text-sm text-slate-500">
                        掲載大学 {count} 校
                      </span>
                    </Link>
                  );
                })}
              </div>
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
      <div className="flex w-full pr-[300px]">
        <GlobalFooter />
      </div>        
    </main>
  );
}
