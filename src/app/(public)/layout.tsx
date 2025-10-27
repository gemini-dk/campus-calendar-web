import Link from 'next/link';
import type { ReactNode } from 'react';
import Image from 'next/image';

import { UniversitySearchBox } from '@/components/university-search-box';

import './globals.css';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="relative z-50 flex h-20 w-full flex-shrink-0 border-b border-slate-200 bg-white/95 text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex h-full w-full items-center gap-6 px-4 lg:px-8">
          <Link href="/" className="flex h-16 w-fit items-center gap-4 text-slate-900">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.25)] border border-slate-200">
              <Image
                src="/icons/icon-512.png"
                alt="Campus Calendar"
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="flex flex-col">
              <span className="text-2xl font-semibold tracking-tight whitespace-nowrap">
                Campus Calendar
              </span>
              <span className="text-xs font-medium text-slate-500">祝日授業も 曜日振替も もう迷わない</span>
            </span>
          </Link>
          <div className="ml-auto flex h-16 items-center">
            <UniversitySearchBox variant="header" />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
