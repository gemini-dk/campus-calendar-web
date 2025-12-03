'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

import DailyCalendarView from '../components/DailyCalendarView';

function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateId(value: string | null): string {
  const today = new Date();
  const fallback = formatDateId(today);
  if (!value) {
    return fallback;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }
  return value;
}

function HomeTabContent() {
  const searchParams = useSearchParams();

  const dateId = useMemo(
    () => normalizeDateId(searchParams?.get('date') ?? null),
    [searchParams],
  );

  return <DailyCalendarView dateId={dateId} />;
}

export default function HomeTab() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center p-6 text-sm text-neutral-600">
          読み込み中...
        </div>
      }
    >
      <HomeTabContent />
    </Suspense>
  );
}
