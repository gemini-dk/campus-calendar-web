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
  const hasSelectedCalendars = integration?.calendarList?.some((entry) => entry.selected) ?? false;

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
    if (!hasSelectedCalendars) {
      return;
    }
    if (syncState.inProgress) {
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }

    const lastSyncedAt = syncState.lastSyncedAt ?? integration.lastSyncedAt ?? null;
    if (lastSyncedAt && Date.now() - lastSyncedAt < minIntervalMs) {
      return;
    }

    void syncNow();
  }, [
    autoSyncEnabled,
    hasSelectedCalendars,
    integration,
    minIntervalMs,
    syncNow,
    syncState.inProgress,
    syncState.lastSyncedAt,
  ]);

  useEffect(() => {
    if (!autoSyncEnabled) {
      return;
    }
    if (!integration || !integration.refreshToken || !hasSelectedCalendars) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      const lastSyncedAt = syncState.lastSyncedAt ?? integration.lastSyncedAt ?? null;
      if (lastSyncedAt && Date.now() - lastSyncedAt < minIntervalMs) {
        return;
      }
      void syncNow();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoSyncEnabled, hasSelectedCalendars, integration, minIntervalMs, syncNow, syncState.lastSyncedAt]);

  return integrationState;
}
