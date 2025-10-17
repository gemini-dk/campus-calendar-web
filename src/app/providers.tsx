"use client";

import type { PropsWithChildren } from "react";

import { UserSettingsProvider } from "@/lib/settings/UserSettingsProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return <UserSettingsProvider>{children}</UserSettingsProvider>;
}

export default AppProviders;
