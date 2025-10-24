import type { Metadata } from 'next';
import Link from 'next/link';

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
    <main className="min-h-screen w-full bg-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
        <header className="flex w-full flex-col gap-4">
          <h1 className="text-3xl font-bold text-neutral-900">全国の大学の学事予定・授業日程をまとめました</h1>
          <p className="text-sm text-neutral-600">
            全国の主要大学を学生数の多い順に掲載しています。大学名をクリックすると、2025年度の学事予定ページへ移動できます。
          </p>
        </header>
        <section className="flex w-full flex-col gap-4">
          {universities.length === 0 ? (
            <p className="text-sm text-neutral-600">現在、掲載できる大学情報がありません。</p>
          ) : (
            <ul className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {universities.map((university) => (
                <li key={university.id} className="h-full w-full">
                  <Link
                    href={`/universities/2025/${encodeURIComponent(university.webId)}`}
                    className="flex h-full w-full flex-col justify-between rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-blue-500 hover:shadow"
                  >
                    <div className="flex w-full flex-col gap-2">
                      <span className="text-base font-semibold text-neutral-900">{university.name}</span>
                      {typeof university.capacity === 'number' ? (
                        <span className="text-xs text-neutral-500">
                          学生数目安: {university.capacity.toLocaleString()}人
                        </span>
                      ) : null}
                    </div>
                    <span className="mt-4 text-xs font-medium text-blue-600">2025年度の学事予定を見る</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
