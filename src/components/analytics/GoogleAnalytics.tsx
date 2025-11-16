"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { profile } = useAuth();
  const userId = useMemo(() => profile?.uid ?? null, [profile?.uid]);

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || typeof window === "undefined" || !pathname) {
      return;
    }

    const url = search ? `${pathname}?${search}` : pathname;
    const config: Record<string, string> = {
      page_path: url,
    };
    if (userId) {
      config.user_id = userId;
    }

    window.gtag?.("config", GA_MEASUREMENT_ID, config);
  }, [pathname, search, userId]);

  return null;
}
