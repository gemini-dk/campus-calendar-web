"use client";

import type { PropsWithChildren } from "react";
import { Suspense } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { UniversitySearchProvider } from "@/lib/search/UniversitySearchContext";
import { UserSettingsProvider } from "@/lib/settings/UserSettingsProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <GoogleAnalytics />
      </Suspense>
      <UniversitySearchProvider>
        <UserSettingsProvider>{children}</UserSettingsProvider>
      </UniversitySearchProvider>
    </ToastProvider>
  );
}

export default AppProviders;
