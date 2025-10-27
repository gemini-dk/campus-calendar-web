"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!GA_ID || typeof window === "undefined" || !pathname) {
      return;
    }

    const url = search ? `${pathname}?${search}` : pathname;

    window.gtag?.("config", GA_ID, {
      page_path: url,
    });
  }, [pathname, search]);

  return null;
}
