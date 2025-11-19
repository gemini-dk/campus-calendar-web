import type { GoogleCalendarEventRecord, GoogleCalendarIntegrationDoc } from './types';

export type GoogleCalendarSyncStore = {
  loadIntegration(userId: string): Promise<GoogleCalendarIntegrationDoc | null>;
  ensureIntegration(userId: string): Promise<void>;
  updateIntegration(userId: string, data: Partial<GoogleCalendarIntegrationDoc>): Promise<void>;
  upsertEvents(userId: string, events: GoogleCalendarEventRecord[]): Promise<void>;
  removeEvents(userId: string, eventUids: string[]): Promise<void>;
  listEventUidsByCalendar(userId: string, calendarId: string): Promise<string[]>;
};
