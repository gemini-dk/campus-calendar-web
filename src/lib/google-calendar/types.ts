export type GoogleCalendarIntegrationDoc = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: number | null;
  syncTokens: Record<string, string> | null;
  lastSyncedAt: number | null;
  calendarList: GoogleCalendarListEntry[] | null;
  lastSyncStatus: 'idle' | 'syncing' | 'error';
  lastSyncError: string | null;
  updatedAt: number;
};

export type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  backgroundColor: string | null;
  foregroundColor: string | null;
  selected: boolean;
};

export type GoogleCalendarEventRecord = {
  calendarId: string;
  eventId: string;
  eventUid: string;
  summary: string;
  description: string | null;
  location: string | null;
  startDateKey: string;
  endDateKey: string;
  startTimestamp: number;
  endTimestamp: number;
  allDay: boolean;
  dayKeys: string[];
  monthKeys: string[];
  fiscalYearKeys: string[];
  updatedAt: number;
  status: string;
  htmlLink: string | null;
  hangoutLink: string | null;
  organizer: {
    displayName: string | null;
    email: string | null;
  } | null;
  createdAt: number;
  colorId: string | null;
  startRaw: {
    dateTime: string | null;
    date: string | null;
    timeZone: string | null;
  };
  endRaw: {
    dateTime: string | null;
    date: string | null;
    timeZone: string | null;
  };
};

export type GoogleCalendarEventSyncResult = {
  syncedCalendars: string[];
  nextSyncTokens: Record<string, string>;
  removedEventUids: string[];
  upsertedEvents: GoogleCalendarEventRecord[];
  refreshedAccessToken: string | null;
  accessTokenExpiresAt: number | null;
};

export type GoogleCalendarSyncState = {
  inProgress: boolean;
  lastSyncedAt: number | null;
  error: string | null;
};
