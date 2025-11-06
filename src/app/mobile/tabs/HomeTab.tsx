'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

import DailyCalendarView from '../components/DailyCalendarView';

function normalizeDateId(value: string | null): string {
  const today = new Date();
  const fallback = today.toISOString().slice(0, 10);
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
