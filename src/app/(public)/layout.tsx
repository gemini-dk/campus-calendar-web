import Link from 'next/link';
import type { ReactNode } from 'react';

import { UniversitySearchBox } from '@/components/university-search-box';

import './globals.css';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col bg-slate-50">
      <header className="relative z-50 w-full flex-shrink-0 border-b border-slate-200 bg-white/95 text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex h-20 w-full max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex h-16 w-fit items-center gap-4 text-slate-900">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-400 text-lg font-semibold tracking-tight text-white shadow-lg">
              CC
            </span>
            <span className="flex flex-col">
              <span className="text-2xl font-semibold tracking-tight">Campus Calendar</span>
              <span className="text-xs font-medium text-slate-500">祝日授業も 曜日振替も もう迷わない</span>
            </span>
          </Link>
          <div className="ml-auto flex h-16 w-full max-w-xs items-center justify-end">
            <div className="flex h-full items-center justify-end">
              <UniversitySearchBox variant="header" />
            </div>
          </div>
        </div>
      </header>
      <div className="flex w-full flex-1 overflow-hidden">
        <div className="flex w-full flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
