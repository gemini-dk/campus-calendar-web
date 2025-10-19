"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function PublicCalendarLanding() {
  const router = useRouter();
  const [fiscalYear, setFiscalYear] = useState("");
  const [calendarId, setCalendarId] = useState("");

  const isDisabled = useMemo(() => {
    const trimmedYear = fiscalYear.trim();
    const trimmedId = calendarId.trim();
    if (!trimmedYear || !trimmedId) {
      return true;
    }
    return false;
  }, [calendarId, fiscalYear]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedYear = fiscalYear.trim();
      const trimmedId = calendarId.trim();
      if (!trimmedYear || !trimmedId) {
        return;
      }
      const search = new URLSearchParams({ year: trimmedYear });
      router.push(`/public/calendar/${encodeURIComponent(trimmedId)}?${search.toString()}`);
    },
    [calendarId, fiscalYear, router],
  );

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-neutral-100 px-4 py-10">
      <div className="flex w-full max-w-xl flex-col rounded-lg bg-white px-6 py-8 shadow">
        <h1 className="text-xl font-semibold text-neutral-900">公開学事カレンダー</h1>
        <p className="mt-2 text-sm text-neutral-600">
          年度とカレンダーIDを入力して、公開学事カレンダーを表示します。
        </p>
        <form className="mt-6 flex w-full flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex w-full flex-col gap-2" htmlFor="public-calendar-fiscal-year">
            <span className="text-sm font-medium text-neutral-800">年度</span>
            <input
              id="public-calendar-fiscal-year"
              value={fiscalYear}
              onChange={(event) => setFiscalYear(event.target.value)}
              placeholder="例: 2024"
              className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="flex w-full flex-col gap-2" htmlFor="public-calendar-calendar-id">
            <span className="text-sm font-medium text-neutral-800">カレンダーID</span>
            <input
              id="public-calendar-calendar-id"
              value={calendarId}
              onChange={(event) => setCalendarId(event.target.value)}
              placeholder="例: campus-calendar"
              className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <button
            type="submit"
            disabled={isDisabled}
            className="mt-2 h-11 w-full rounded bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            表示
          </button>
        </form>
      </div>
    </div>
  );
}
