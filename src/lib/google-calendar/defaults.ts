import type { GoogleCalendarIntegrationDoc } from './types';

export const DEFAULT_GOOGLE_CALENDAR_INTEGRATION_DOC: GoogleCalendarIntegrationDoc = {
  accessToken: null,
  refreshToken: null,
  tokenType: null,
  scope: null,
  expiresAt: null,
  syncTokens: null,
  lastSyncedAt: null,
  calendarList: null,
  lastSyncStatus: 'idle',
  lastSyncError: null,
  updatedAt: 0,
};

export function buildInitialIntegrationDocument(): GoogleCalendarIntegrationDoc {
  return {
    ...DEFAULT_GOOGLE_CALENDAR_INTEGRATION_DOC,
    updatedAt: Date.now(),
  };
}
