import { getDoc, setDoc, type Firestore } from 'firebase/firestore';

import { buildInitialIntegrationDocument, DEFAULT_GOOGLE_CALENDAR_INTEGRATION_DOC } from '../defaults';
import { getIntegrationDocRef } from '../firestore';
import type { GoogleCalendarSyncStore } from '../syncStore';
import type { GoogleCalendarIntegrationDoc } from '../types';
import {
  listGoogleCalendarEventUidsByCalendar,
  removeGoogleCalendarEvents,
  upsertGoogleCalendarEvents,
} from '../firestore';

export function createClientSyncStore(db: Firestore): GoogleCalendarSyncStore {
  return {
    async loadIntegration(userId: string): Promise<GoogleCalendarIntegrationDoc | null> {
      const ref = getIntegrationDocRef(db, userId);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        return null;
      }
      return snapshot.data() as GoogleCalendarIntegrationDoc;
    },
    async ensureIntegration(userId: string): Promise<void> {
      const ref = getIntegrationDocRef(db, userId);
      const snapshot = await getDoc(ref);
      if (snapshot.exists()) {
        return;
      }
      const payload = buildInitialIntegrationDocument();
      await setDoc(ref, payload);
    },
    async updateIntegration(userId: string, data: Partial<GoogleCalendarIntegrationDoc>): Promise<void> {
      const ref = getIntegrationDocRef(db, userId);
      await setDoc(ref, data, { merge: true });
    },
    async upsertEvents(userId: string, events) {
      await upsertGoogleCalendarEvents(db, userId, events);
    },
    async removeEvents(userId: string, eventUids) {
      await removeGoogleCalendarEvents(db, userId, eventUids);
    },
    async listEventUidsByCalendar(userId: string, calendarId: string): Promise<string[]> {
      return listGoogleCalendarEventUidsByCalendar(db, userId, calendarId);
    },
  } satisfies GoogleCalendarSyncStore;
}

export { DEFAULT_GOOGLE_CALENDAR_INTEGRATION_DOC };
