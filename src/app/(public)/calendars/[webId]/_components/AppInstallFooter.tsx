"use client";

import { useCallback } from "react";

type AppInstallFooterProps = {
  fiscalYear: string;
  calendar: {
    calendarId: string;
    calendarName: string;
    fiscalYear?: string | null;
  } | null;
};

export default function AppInstallFooter({ fiscalYear, calendar }: AppInstallFooterProps) {
  const handleOpenMobileApp = useCallback(() => {
    if (!calendar) {
      return;
    }

    const normalizedFiscalYear = (calendar.fiscalYear ?? fiscalYear ?? "").trim();
    const normalizedCalendarId = calendar.calendarId.trim();
    const normalizedCalendarName = calendar.calendarName.trim();

    if (!normalizedFiscalYear || !normalizedCalendarId || !normalizedCalendarName) {
      return;
    }

    const params = new URLSearchParams({
      tab: "calendar",
      fiscalYear: normalizedFiscalYear,
      calendarId: normalizedCalendarId,
      calendarName: normalizedCalendarName,
    });

    const mobileUrl = new URL("/mobile", window.location.origin);
    mobileUrl.search = params.toString();

    window.location.href = mobileUrl.toString();
  }, [calendar, fiscalYear]);

  const isActionAvailable = Boolean(
    calendar?.calendarId && calendar.calendarName && (calendar.fiscalYear || fiscalYear),
  );

  const actionButtonClassName =
    "flex h-12 w-full items-center justify-center rounded-full px-4 text-sm font-semibold text-white shadow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

  return (
    <footer className="fixed bottom-0 left-0 flex min-h-[6.5rem] w-full items-center bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)]">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-col gap-1 md:w-3/5">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            アプリで更に便利に
          </span>
          <p className="text-base font-bold text-neutral-900 md:text-lg">
            インストールしていつでも簡単に閲覧できます！
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-2/5 md:flex-row md:justify-end">
          <button
            type="button"
            className={`${actionButtonClassName} bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 md:w-auto md:min-w-[220px]`}
            onClick={handleOpenMobileApp}
            disabled={!isActionAvailable}
          >
            インストール
          </button>
        </div>
      </div>
    </footer>
  );
}
