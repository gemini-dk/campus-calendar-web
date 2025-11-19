'use client';

import { useEffect } from 'react';

import { useGoogleCalendarIntegration } from './useGoogleCalendarIntegration';
import { GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS } from '../syncPolicies';

type UseGoogleCalendarAutoSyncOptions = {
  enabled?: boolean;
  minIntervalMs?: number;
};

export function useGoogleCalendarAutoSync(options?: UseGoogleCalendarAutoSyncOptions) {
  const autoSyncEnabled = options?.enabled ?? true;
  const minIntervalMs = options?.minIntervalMs ?? GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS;

  const integrationState = useGoogleCalendarIntegration({ enabled: autoSyncEnabled });
  const { integration, syncState, syncNow } = integrationState;

  useEffect(() => {
    if (!autoSyncEnabled) {
      return;
    }
    if (!integration) {
      return;
    }
    if (!integration.refreshToken) {
      return;
    }
    if (syncState.inProgress) {
      return;
    }

    const lastSyncedAt = syncState.lastSyncedAt ?? integration.lastSyncedAt ?? null;
    if (lastSyncedAt && Date.now() - lastSyncedAt < minIntervalMs) {
      return;
    }

    void syncNow();
  }, [
    autoSyncEnabled,
    integration,
    minIntervalMs,
    syncNow,
    syncState.inProgress,
    syncState.lastSyncedAt,
  ]);

  return integrationState;
}
