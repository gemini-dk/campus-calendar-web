import type { Metadata } from "next";
import Link from "next/link";

import { PWA_APP_NAME } from "@/lib/pwa";

export const metadata: Metadata = {
  title: `${PWA_APP_NAME} アプリのインストール方法`,
  description: `${PWA_APP_NAME} をスマートフォンにインストールしてホーム画面から素早くアクセスする手順を紹介します。`,
};

export default function PwaInstallPage() {
  return (
    <main className="flex min-h-screen w-full flex-1 bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="flex min-h-screen w-full items-stretch justify-center px-4 py-12 md:py-16">
        <article className="flex min-h-full w-full max-w-[720px] flex-col gap-10 rounded-3xl border border-blue-200/60 bg-white p-10 text-slate-900 shadow-[0_24px_60px_rgba(148,163,184,0.25)]">
          <header className="flex w-full flex-col gap-4">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500">PWA Install Guide</span>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">{PWA_APP_NAME} アプリのインストール方法</h1>
            <p className="text-sm leading-relaxed text-slate-600 md:text-base">
              {PWA_APP_NAME}
              をホーム画面に追加すると、ネイティブアプリのようにワンタップで大学の学事予定へアクセスできます。お使いのブラウザ別に、以下の手順に沿ってインストールしてください。
            </p>
          </header>

          <section className="flex w-full flex-col gap-4">
            <h2 className="text-2xl font-semibold text-slate-900">iPhone / iPad（Safari）</h2>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700 md:text-base">
              <li>{PWA_APP_NAME} の大学カレンダーページを Safari で開きます。</li>
              <li>画面下部の共有アイコン（<span aria-hidden>□</span>から矢印が出ているボタン）をタップします。</li>
              <li>表示されたメニューを下にスクロールし、「ホーム画面に追加」を選択します。</li>
              <li>名前を確認して「追加」をタップすると、ホーム画面にアイコンが作成されます。</li>
            </ol>
            <p className="rounded-2xl border border-blue-100 bg-sky-50 p-4 text-xs leading-relaxed text-slate-600 md:text-sm">
              ※ 共有メニューに「ホーム画面に追加」が表示されない場合は、メニュー最下部の「アクションを編集」から追加してください。
            </p>
          </section>

          <section className="flex w-full flex-col gap-4">
            <h2 className="text-2xl font-semibold text-slate-900">Android（Chrome）</h2>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700 md:text-base">
              <li>{PWA_APP_NAME} の大学カレンダーページを Chrome で開きます。</li>
              <li>画面右上のメニュー（︙）をタップします。</li>
              <li>「アプリをインストール」または「ホーム画面に追加」を選択します。</li>
              <li>表示されるダイアログで「インストール」もしくは「追加」をタップすると完了です。</li>
            </ol>
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs leading-relaxed text-slate-600 md:text-sm">
              ※ メニューに「アプリをインストール」が表示されない場合は、一度ページを再読み込みしてから再度お試しください。
            </p>
          </section>

          <section className="flex w-full flex-col gap-4">
            <h2 className="text-2xl font-semibold text-slate-900">インストール後の使い方</h2>
            <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-slate-700 md:text-base">
              <li>ホーム画面に追加されたアイコンをタップすると、アプリが全画面で表示されます。</li>
              <li>アプリ内の「スマホアプリ表示」ボタンから、他の大学カレンダーも同じように開けます。</li>
              <li>必要に応じて、ブラウザのメニューから「通知を許可」することで授業日の通知を受け取れます。</li>
            </ul>
          </section>

          <footer className="flex w-full flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-700 md:flex-row md:items-center md:justify-between md:text-base">
            <div className="flex w-full flex-col gap-1 md:w-auto">
              <span className="font-semibold text-slate-900">インストールがうまくいかない場合</span>
              <p>ブラウザのバージョンを最新に更新し、シークレットモードを使用していないか確認してください。</p>
            </div>
            <Link
              href="/"
              className="flex h-12 w-full items-center justify-center rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:w-auto"
            >
              大学一覧に戻る
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
