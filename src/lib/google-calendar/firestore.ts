import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

import {
  GOOGLE_CALENDAR_EVENTS_COLLECTION,
  GOOGLE_CALENDAR_INTEGRATION_COLLECTION,
  GOOGLE_CALENDAR_INTEGRATION_DOC_ID,
  GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH,
} from './constants';
import type { GoogleCalendarEventRecord, GoogleCalendarIntegrationDoc } from './types';

export function getIntegrationDocRef(db: Firestore, userId: string): DocumentReference<GoogleCalendarIntegrationDoc> {
  return doc(
    collection(doc(collection(db, 'users'), userId), GOOGLE_CALENDAR_INTEGRATION_COLLECTION),
    GOOGLE_CALENDAR_INTEGRATION_DOC_ID,
  ) as DocumentReference<GoogleCalendarIntegrationDoc>;
}

export function getEventsCollectionRef(db: Firestore, userId: string) {
  return collection(doc(collection(db, 'users'), userId), GOOGLE_CALENDAR_EVENTS_COLLECTION);
}

export async function removeAllGoogleCalendarEvents(db: Firestore, userId: string): Promise<void> {
  const eventsRef = getEventsCollectionRef(db, userId);
  let hasMore = true;
  while (hasMore) {
    const snapshot = await getDocs(query(eventsRef, orderBy('updatedAt'), limit(GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH)));
    if (snapshot.empty) {
      hasMore = false;
      break;
    }
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
    });
    await batch.commit();
    hasMore = snapshot.size === GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH;
  }
}

export async function upsertGoogleCalendarEvents(
  db: Firestore,
  userId: string,
  events: GoogleCalendarEventRecord[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  let batch = writeBatch(db);
  let counter = 0;
  for (const event of events) {
    const eventsRef = getEventsCollectionRef(db, userId);
    const eventRef = doc(eventsRef, event.eventUid);
    batch.set(eventRef, event);
    counter += 1;
    if (counter >= GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH) {
      await batch.commit();
      batch = writeBatch(db);
      counter = 0;
    }
  }
  if (counter > 0) {
    await batch.commit();
  }
}

export async function removeGoogleCalendarEvents(
  db: Firestore,
  userId: string,
  eventUids: string[],
): Promise<void> {
  if (eventUids.length === 0) {
    return;
  }
  let batch = writeBatch(db);
  let counter = 0;
  for (const uid of eventUids) {
    const eventsRef = getEventsCollectionRef(db, userId);
    const ref = doc(eventsRef, uid);
    batch.delete(ref);
    counter += 1;
    if (counter >= GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH) {
      await batch.commit();
      batch = writeBatch(db);
      counter = 0;
    }
  }
  if (counter > 0) {
    await batch.commit();
  }
}

export async function deleteIntegrationDocument(db: Firestore, userId: string): Promise<void> {
  const ref = getIntegrationDocRef(db, userId);
  await deleteDoc(ref);
}

export async function markIntegrationSyncState(
  db: Firestore,
  userId: string,
  state: Pick<GoogleCalendarIntegrationDoc, 'lastSyncStatus' | 'lastSyncError' | 'lastSyncedAt' | 'updatedAt'>,
): Promise<void> {
  const ref = getIntegrationDocRef(db, userId);
  await updateDoc(ref, state);
}

export async function listEventsByDay(
  db: Firestore,
  userId: string,
  dateId: string,
) {
  const eventsRef = getEventsCollectionRef(db, userId);
  const eventsQuery = query(eventsRef, where('dayKeys', 'array-contains', dateId), orderBy('startTimestamp'));
  return getDocs(eventsQuery);
}

export async function listGoogleCalendarEventUidsByCalendar(
  db: Firestore,
  userId: string,
  calendarId: string,
): Promise<string[]> {
  const eventsRef = getEventsCollectionRef(db, userId);
  const snapshot = await getDocs(query(eventsRef, where('calendarId', '==', calendarId)));
  if (snapshot.empty) {
    return [];
  }
  return snapshot.docs.map((docSnapshot) => docSnapshot.id);
}
