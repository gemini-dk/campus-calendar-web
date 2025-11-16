"use client";

import { useCallback } from "react";

import { openSupportForm } from "../[webId]/calendar/_components/supportForm";

export default function TopPageAdvertisementSection() {
  const handleAdvertisementClick = useCallback(() => {
    openSupportForm({
      type: "誤り報告",
      college: "全大学横断",
      message: "大学のインカレ団体の紹介などを掲載しませんか？お気軽にご連絡ください。",
    });
  }, []);

  return (
    <>
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center text-sm text-neutral-600">
        <div className="text-sm font-semibold text-neutral-700">広告枠</div>
        <p>
          ここに表示する広告を募集中です。
          <br />
          大学のインカレ団体紹介などの掲載をご希望の方はお気軽にご連絡ください。
        </p>
        <button
          type="button"
          onClick={handleAdvertisementClick}
          className="inline-flex h-11 w-full items-center justify-center rounded border border-amber-500 bg-amber-500/10 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-500/20"
        >
          広告掲載の相談をする
        </button>
      </div>
    </>
  );
}
