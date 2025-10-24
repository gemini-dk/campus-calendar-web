import type { Metadata } from 'next';

import { SearchableUniversityGrid } from './_components/university-grid';
import { listUniversities } from '@/lib/data/service/university.service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '全国大学別 学事予定・授業日程まとめ 2025年度',
  description:
    '全国の大学ごとの2025年度学事予定・授業日程を一覧で確認できます。各大学ページから公開カレンダーへアクセスできます。',
};

export default async function HomePage() {
  const universities = await listUniversities();

  return (
    <main className="flex min-h-[calc(100vh-5rem)] w-full justify-center bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4">
        <section className="flex w-full flex-col gap-6 rounded-3xl border border-blue-900/40 bg-slate-900/70 p-10 text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.55)]">
          <div className="flex w-full flex-col gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">Academic Planning</span>
            <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
              2025年度 全国大学別学事予定ポータル
            </h1>
            <p className="text-sm leading-relaxed text-slate-300 md:text-base">
              Campus Calendar は全国の大学の学事予定・授業日程を整理し、学生生活に必要な情報を信頼できる形でお届けします。
              最新の学事カレンダーに素早くアクセスし、履修登録やイベントの準備にご活用ください。
            </p>
          </div>
          <div className="grid w-full gap-4 text-xs text-slate-400 sm:grid-cols-3">
            <div className="flex h-full w-full flex-col gap-1 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-blue-400">Data</span>
              <span className="text-sm font-semibold text-slate-100">全国主要大学を掲載</span>
              <span>学生数の多い順に並び替え、主要校の学事予定をすぐに確認できます。</span>
            </div>
            <div className="flex h-full w-full flex-col gap-1 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-blue-400">Access</span>
              <span className="text-sm font-semibold text-slate-100">学事予定ページへ直通</span>
              <span>各大学のページから公開カレンダーを閲覧し、予定を素早く把握できます。</span>
            </div>
            <div className="flex h-full w-full flex-col gap-1 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-blue-400">Support</span>
              <span className="text-sm font-semibold text-slate-100">リクエスト機能</span>
              <span>情報が未整備の大学はリクエストを送信して整備を促進できます。</span>
            </div>
          </div>
        </section>

        <SearchableUniversityGrid universities={universities} />
      </div>
    </main>
  );
}
