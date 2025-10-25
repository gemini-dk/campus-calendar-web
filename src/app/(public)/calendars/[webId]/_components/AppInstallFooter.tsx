"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const MOBILE_ROTATION_INTERVAL_MS = 30_000;

const MOBILE_MESSAGES = [
  "このカレンダースマホに入れておきませんか？",
  "休日授業日の前日に通知が欲しくありませんか？",
  "授業日程を考慮した時間割アプリを使いませんか？",
];

type AppInstallFooterProps = {
  fiscalYear: string;
  calendar: {
    calendarId: string;
    calendarName: string;
    fiscalYear?: string | null;
  } | null;
};

export default function AppInstallFooter({ fiscalYear, calendar }: AppInstallFooterProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % MOBILE_MESSAGES.length);
    }, MOBILE_ROTATION_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const activeMessage = useMemo(() => MOBILE_MESSAGES[activeIndex], [activeIndex]);

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

  const mobileButtonClassName =
    "flex h-12 w-full items-center justify-center rounded-full px-4 text-sm font-semibold text-white shadow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

  return (
    <footer className="fixed bottom-0 left-0 w-full bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-col gap-1 md:w-3/5">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            アプリでさらに便利に
          </span>
          <p className="text-base font-bold text-neutral-900 md:text-lg">
            Campus Calendar アプリをインストールして最新情報を受け取りましょう。
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-2/5 md:flex-row md:justify-end">
          <div className="flex w-full md:hidden">
            <button
              type="button"
              className={`${mobileButtonClassName} bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500`}
              onClick={handleOpenMobileApp}
              disabled={!isActionAvailable}
            >
              {activeMessage}
            </button>
          </div>
          <div className="hidden w-full items-center justify-end gap-3 md:flex">
            {MOBILE_MESSAGES.map((message) => (
              <button
                key={message}
                type="button"
                className={`${mobileButtonClassName} min-w-[220px] bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500`}
                onClick={handleOpenMobileApp}
                disabled={!isActionAvailable}
              >
                {message}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
