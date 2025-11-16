"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";

import PublicCalendarView from "@/app/(public)/public/calendar/_components/PublicCalendarView";
import type { CalendarDay, CalendarTerm } from "@/lib/data/schema/calendar";
import type { UniversityCalendar } from "@/lib/data/schema/university";

import AppInstallFooter from "./AppInstallFooter";
import SupportDialog, { type SupportDialogType } from "./SupportDialog";

type PrefetchedUniversityCalendar = UniversityCalendar & {
  calendarDays: CalendarDay[];
  calendarTerms: CalendarTerm[];
};

export type UniversityCalendarContentProps = {
  activeFiscalYear: string;
  calendarsByFiscalYear: Record<string, PrefetchedUniversityCalendar[]>;
  webId: string;
  universityName: string;
  horizontalPaddingClassName?: string;
};

export type UniversityCalendarContentHandle = {
  openSupportDialog: (type: SupportDialogType) => void;
};

const UniversityCalendarContent = forwardRef<
  UniversityCalendarContentHandle,
  UniversityCalendarContentProps
>(function UniversityCalendarContent(
  {
  activeFiscalYear,
  calendarsByFiscalYear,
  webId,
  universityName,
  horizontalPaddingClassName = "",
  },
  ref,
) {
  const calendars = useMemo(
    () => calendarsByFiscalYear[activeFiscalYear] ?? [],
    [calendarsByFiscalYear, activeFiscalYear],
  );
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    () => calendarsByFiscalYear[activeFiscalYear]?.[0]?.id ?? "",
  );
  const [supportDialogType, setSupportDialogType] = useState<SupportDialogType | null>(null);

  useImperativeHandle(ref, () => ({
    openSupportDialog: (type: SupportDialogType) => {
      setSupportDialogType(type);
    },
  }));

  useEffect(() => {
    setSelectedCalendarId(calendars[0]?.id ?? "");
  }, [calendars]);

  const activeCalendar = useMemo(() => {
    if (!selectedCalendarId) {
      return calendars[0] ?? null;
    }
    return calendars.find((item) => item.id === selectedCalendarId) ?? calendars[0] ?? null;
  }, [calendars, selectedCalendarId]);

  const hasCalendars = calendars.length > 0;
  const withHorizontalPadding = (className: string) =>
    horizontalPaddingClassName ? `${className} ${horizontalPaddingClassName}` : className;

  const openSupportForm = useCallback((params: Record<string, string>) => {
    const url = new URL("https://campus-calendar.launchfy.support/ja/supportform");
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }, []);

  const handleReportClick = useCallback(() => {
    if (!activeCalendar) {
      return;
    }
    openSupportForm({
      type: "誤り報告",
      college: universityName,
      calendar: activeCalendar.name,
    });
  }, [activeCalendar, openSupportForm, universityName]);

  const handleRequestClick = useCallback(() => {
    openSupportForm({
      type: "カレンダー追加依頼",
      college: universityName,
      message:
        "対応して欲しい学事予定の内容が記載されている公式ページのURLを教えてもらえると対応がしやすいです。",
    });
  }, [openSupportForm, universityName]);

  return (
    <>
      <div className="flex w-full flex-col gap-6 pb-36 md:pb-32">
        <div className={withHorizontalPadding("flex w-full flex-col gap-4 md:flex-row md:items-end md:justify-between")}>
          <div className="flex w-full flex-col gap-2 md:flex-1">
            {hasCalendars ? (
              <>
                <label className="sr-only" htmlFor="university-calendar-select">
                  学事予定を選択
                </label>
                <select
                  id="university-calendar-select"
                  value={activeCalendar?.id ?? ""}
                  onChange={(event) => setSelectedCalendarId(event.target.value)}
                  aria-label="学事予定を選択"
                  className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
                {activeCalendar?.note ? <p className="text-xs text-neutral-500">{activeCalendar.note}</p> : null}
              </>
            ) : null}
          </div>
        </div>
        {hasCalendars ? (
          activeCalendar ? (
            <div className="w-full">
              <PublicCalendarView
                dataset={{
                  fiscalYear: activeCalendar.fiscalYear || activeFiscalYear,
                  calendarId: activeCalendar.calendarId,
                  hasSaturdayClasses: activeCalendar.hasSaturdayClasses ?? null,
                  days: activeCalendar.calendarDays,
                  terms: activeCalendar.calendarTerms,
                }}
                initialMonth={null}
                displayMode="grid"
              />
            </div>
          ) : null
        ) : (
          <div
            className={withHorizontalPadding(
              "flex w-full flex-col rounded-lg border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-600",
            )}
          >
            {activeFiscalYear}年度の公開学事カレンダーが登録されていません。
          </div>
        )}
        <div className={withHorizontalPadding("flex w-full justify-end gap-2")}>
          <button
            type="button"
            onClick={handleReportClick}
            disabled={!activeCalendar}
            className="inline-flex items-center justify-center rounded border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            誤り報告
          </button>
          <button
            type="button"
            onClick={handleRequestClick}
            className="inline-flex items-center justify-center rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            カレンダー追加依頼
          </button>
        </div>
      </div>
      <AppInstallFooter
        fiscalYear={activeFiscalYear}
        webId={webId}
        universityName={universityName}
        calendar={
          activeCalendar
            ? {
                calendarId: activeCalendar.calendarId,
                calendarName: activeCalendar.name,
                fiscalYear: activeCalendar.fiscalYear || activeFiscalYear,
                hasSaturdayClasses: activeCalendar.hasSaturdayClasses ?? null,
              }
            : null
        }
      />
      {supportDialogType ? (
        <SupportDialog
          type={supportDialogType}
          onClose={() => setSupportDialogType(null)}
          activeFiscalYear={activeFiscalYear}
          universityName={universityName}
          webId={webId}
          calendar={activeCalendar}
        />
      ) : null}
    </>
  );
});

export default UniversityCalendarContent;
