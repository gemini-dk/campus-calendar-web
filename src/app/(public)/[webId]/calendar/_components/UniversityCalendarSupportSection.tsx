"use client";

import { useCallback, useRef } from "react";

import UniversityCalendarContent, {
  type UniversityCalendarContentHandle,
  type UniversityCalendarContentProps,
} from "./UniversityCalendarContent";

export type UniversityCalendarSupportSectionProps = UniversityCalendarContentProps;

export default function UniversityCalendarSupportSection(
  props: UniversityCalendarSupportSectionProps,
) {
  const contentRef = useRef<UniversityCalendarContentHandle>(null);

  const handleAdvertisementClick = useCallback(() => {
    contentRef.current?.openSupportDialog("advertisement");
  }, []);

  return (
    <>
      <UniversityCalendarContent ref={contentRef} {...props} />
      <aside className="hidden fixed right-0 top-0 z-10 flex h-full w-[300px] flex-col overflow-y-auto border-l border-neutral-300 bg-white min-[1024px]:flex">
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center text-sm text-neutral-600">
          <div className="text-sm font-semibold text-neutral-700">広告枠</div>
          <button
            type="button"
            onClick={handleAdvertisementClick}
            className="inline-flex h-11 w-full items-center justify-center rounded border border-amber-500 bg-amber-500/10 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-500/20"
          >
            広告掲載の相談をする
          </button>
          <p className="text-xs leading-relaxed text-neutral-500">
            ここに広告掲載をご希望される方はご連絡ください。
            <br />
            大学インカレ団体の紹介については当面無料で掲載したいと考えていますのでお気軽にご相談ください。
          </p>
        </div>
      </aside>
    </>
  );
}
