"use client";

import type { PropsWithChildren } from "react";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { UniversitySearchProvider } from "@/lib/search/UniversitySearchContext";
import { UserSettingsProvider } from "@/lib/settings/UserSettingsProvider";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID;

function AnalyticsEffect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || typeof window === "undefined") {
      return;
    }

    const url = pathname + (searchParams.size ? `?${searchParams.toString()}` : "");

    window.gtag?.("config", GA_MEASUREMENT_ID, {
      page_path: url,
    });
  }, [pathname, searchParams]);

  return null;
}

function AnalyticsProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AnalyticsProvider>
      <UniversitySearchProvider>
        <UserSettingsProvider>
          {children}
          <Suspense fallback={null}>
            <AnalyticsEffect />
          </Suspense>
        </UserSettingsProvider>
      </UniversitySearchProvider>
    </AnalyticsProvider>
  );
}

export default AppProviders;
