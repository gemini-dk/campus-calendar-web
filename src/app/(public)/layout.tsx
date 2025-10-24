import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-slate-950">
      <div className="flex min-h-screen w-full flex-col">
        <header className="w-full border-b border-slate-900/60 bg-slate-950/90 text-slate-100 shadow-[0_6px_24px_rgba(15,23,42,0.35)]">
          <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-6 px-4">
            <Link href="/" className="flex h-16 w-fit items-center gap-4 text-slate-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-slate-700 text-lg font-semibold tracking-tight shadow-lg">
                CC
              </span>
              <span className="flex flex-col">
                <span className="text-2xl font-semibold tracking-tight">Campus Calendar</span>
                <span className="text-xs font-medium text-slate-400">全国の学事予定を、ひとつのダッシュボードで。</span>
              </span>
            </Link>
            <nav className="flex h-16 w-fit items-center justify-end">
              <Link
                href="/mobile"
                className="flex h-11 w-fit items-center justify-center rounded-full border border-blue-500/60 px-5 text-sm font-semibold text-blue-100 transition hover:border-blue-400 hover:bg-blue-500/10 hover:text-white"
              >
                モバイルアプリのご案内
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex w-full flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
