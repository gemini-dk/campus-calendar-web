"use client";

import { useState } from "react";

import SupportDialog from "../[webId]/calendar/_components/SupportDialog";
import { DEFAULT_FISCAL_YEAR } from "@/lib/constants/fiscal-year";

export default function TopPageAdvertisementSection() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
          onClick={() => setIsDialogOpen(true)}
          className="inline-flex h-11 w-full items-center justify-center rounded border border-amber-500 bg-amber-500/10 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-500/20"
        >
          広告掲載の相談をする
        </button>
      </div>
      {isDialogOpen ? (
        <SupportDialog
          type="advertisement"
          onClose={() => setIsDialogOpen(false)}
          activeFiscalYear={DEFAULT_FISCAL_YEAR}
          universityName="全大学横断"
          webId="top-page"
          calendar={null}
        />
      ) : null}
    </>
  );
}
