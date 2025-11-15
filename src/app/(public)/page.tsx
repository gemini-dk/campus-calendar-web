import type { Metadata } from 'next';

import { SearchableUniversityGrid } from './_components/university-grid';
import TopPageAdvertisementSection from './_components/TopPageAdvertisementSection';
import { listUniversities } from '@/lib/data/service/university.service';
import GlobalFooter from '@/components/ui/GlobalFooter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '全国大学別 学事予定・授業日程まとめ 2025年度',
  description:
    '全国の大学ごとの2025年度学事予定・授業日程を一覧で確認できます。各大学ページから公開カレンダーへアクセスできます。',
};

export default async function HomePage() {
  const universities = await listUniversities();

  return (
    <main className="relative flex min-h-screen w-full flex-1 flex-col bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="flex w-full min-[1024px]:pr-0">
        <div className="flex w-full justify-center px-4 pt-12 min-[1024px]:pr-[300px]">
          <div className="w-full max-w-[724px] min-[1280px]:max-w-[980px] 2xl:max-w-[1236px]">
            <section className="flex w-full flex-col gap-8 rounded-3xl border border-blue-200/60 bg-white p-10 text-slate-900 shadow-[0_24px_60px_rgba(148,163,184,0.25)]">
              <div className="flex w-full flex-col gap-3">
                <span className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">Academic Planning</span>
                <h1 className="text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
                  2025年度 全国大学別学事予定ポータル
                </h1>
                <p className="text-sm leading-relaxed text-slate-600 md:text-base">
                  大学の授業日程は、祝日なのに講義があったり、木曜なのに月曜授業だったりと一般のカレンダーとは異なります。<br/>
                  このような特殊な日程もCampus Calendarならひと目でわかります。このカレンダーを活用して、きちんと授業に出席しましょう!
                </p>
              </div>
              <div className="grid w-full gap-4 text-xs text-slate-600 sm:grid-cols-3">
                <div className="flex h-full w-full flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-blue-500">Data</span>
                  <span className="text-sm font-semibold text-slate-900">全国主要大学を掲載</span>
                  <span>学生数の多い大学を優先的に100校近い大学の学事予定を網羅しています。</span>
                </div>
                <div className="flex h-full w-full flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-blue-500">Mobile</span>
                  <span className="text-sm font-semibold text-slate-900">モバイルアプリを用意</span>
                  <span>このカレンダーをスマホにインストール可能です。ホーム画面からワンタッチで自分の大学の学事予定が表示できます。</span>
                </div>
                <div className="flex h-full w-full flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-blue-500">Support</span>
                  <span className="text-sm font-semibold text-slate-900">時間割・カレンダー機能も便利</span>
                  <span>授業を登録すると、大学の学期・授業日程を踏まえた予定表示をしてくれます。</span>
                </div>
              </div>
            </section>

            <div className="mt-12 w-full">
              <SearchableUniversityGrid universities={universities} limit={50} />
            </div>
            <div className="flex w-full pt-20 pb-0">
              <GlobalFooter />
            </div>            
          </div>
          
        </div>
        <aside className="hidden fixed right-0 top-0 w-[300px] h-full flex-col min-[1024px]:flex z-10 overflow-y-auto">
          <div className="flex h-full w-full border-l border-neutral-300 bg-white">
            <TopPageAdvertisementSection />
          </div>
        </aside>
      </div>
    </main>
  );
}
