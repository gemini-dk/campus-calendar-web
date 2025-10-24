"use client";

import type { PropsWithChildren } from "react";

import { UniversitySearchProvider } from "@/lib/search/UniversitySearchContext";
import { UserSettingsProvider } from "@/lib/settings/UserSettingsProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <UniversitySearchProvider>
      <UserSettingsProvider>{children}</UserSettingsProvider>
    </UniversitySearchProvider>
  );
}

export default AppProviders;
