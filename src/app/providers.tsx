"use client";

import type { PropsWithChildren } from "react";
import { Suspense } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { UniversitySearchProvider } from "@/lib/search/UniversitySearchContext";
import { UserSettingsProvider } from "@/lib/settings/UserSettingsProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <>
      <Suspense fallback={null}>
        <GoogleAnalytics />
      </Suspense>
      <UniversitySearchProvider>
        <UserSettingsProvider>{children}</UserSettingsProvider>
      </UniversitySearchProvider>
    </>
  );
}

export default AppProviders;
