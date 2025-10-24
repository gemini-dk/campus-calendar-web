"use client";

import { useEffect, useMemo, useState } from "react";

const MOBILE_ROTATION_INTERVAL_MS = 30_000;

const MOBILE_MESSAGES = [
  "このカレンダースマホに入れておきませんか？",
  "休日授業日の前日に通知が欲しくありませんか？",
  "授業日程を考慮した時間割アプリを使いませんか？",
];

export default function AppInstallFooter() {
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
              className="flex h-12 w-full items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {activeMessage}
            </button>
          </div>
          <div className="hidden w-full items-center justify-end gap-3 md:flex">
            {MOBILE_MESSAGES.map((message) => (
              <button
                key={message}
                type="button"
                className="flex h-12 min-w-[220px] items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
