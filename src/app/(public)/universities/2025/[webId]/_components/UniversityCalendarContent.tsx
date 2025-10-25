"use client";

import { useMemo, useState } from "react";

import PublicCalendarView from "@/app/(public)/public/calendar/_components/PublicCalendarView";
import type { UniversityCalendar } from "@/lib/data/schema/university";

import AppInstallFooter from "./AppInstallFooter";

type UniversityCalendarContentProps = {
  fiscalYear: string;
  calendars: UniversityCalendar[];
};

export default function UniversityCalendarContent({ fiscalYear, calendars }: UniversityCalendarContentProps) {
  const [selectedCalendarId, setSelectedCalendarId] = useState(() => calendars[0]?.id ?? "");

  const activeCalendar = useMemo(() => {
    if (!selectedCalendarId) {
      return calendars[0] ?? null;
    }
    return calendars.find((item) => item.id === selectedCalendarId) ?? calendars[0] ?? null;
  }, [calendars, selectedCalendarId]);

  return (
    <>
      <div className="flex w-full flex-col gap-6 pb-36 md:pb-32">
        {calendars.length > 0 ? (
          <>
            <div className="flex w-full flex-col gap-2">
              <label className="text-sm font-semibold text-neutral-800" htmlFor="university-calendar-select">
                学事予定を選択
              </label>
              <select
                id="university-calendar-select"
                value={activeCalendar?.id ?? ""}
                onChange={(event) => setSelectedCalendarId(event.target.value)}
                className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </option>
                ))}
              </select>
              {activeCalendar?.note ? (
                <p className="text-xs text-neutral-500">{activeCalendar.note}</p>
              ) : null}
            </div>
            {activeCalendar ? (
              <div className="w-full">
                <PublicCalendarView
                  fiscalYear={activeCalendar.fiscalYear || fiscalYear}
                  calendarId={activeCalendar.calendarId}
                  initialMonth={null}
                  hasSaturdayClasses={activeCalendar.hasSaturdayClasses ?? true}
                  displayMode="grid"
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex w-full flex-col rounded-lg border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-600">
            2025年度の公開学事カレンダーが登録されていません。
          </div>
        )}
        <div className="flex w-full justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-100"
          >
            間違い報告
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            カレンダー追加依頼
          </button>
        </div>
      </div>
      <AppInstallFooter
        fiscalYear={fiscalYear}
        calendar={
          activeCalendar
            ? {
                calendarId: activeCalendar.calendarId,
                calendarName: activeCalendar.name,
                fiscalYear: activeCalendar.fiscalYear,
              }
            : null
        }
      />
    </>
  );
}
