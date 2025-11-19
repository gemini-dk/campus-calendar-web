import type { GoogleCalendarEventRecord, GoogleCalendarIntegrationDoc } from '../types';
import type { GoogleCalendarSyncStore } from '../syncStore';
import { buildInitialIntegrationDocument } from '../defaults';
import {
  GOOGLE_CALENDAR_EVENTS_COLLECTION,
  GOOGLE_CALENDAR_INTEGRATION_COLLECTION,
  GOOGLE_CALENDAR_INTEGRATION_DOC_ID,
  GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH,
} from '../constants';

const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';
const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT ?? '';

if (!PROJECT_ID) {
  throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID が設定されていません。');
}

type FirestoreValue = {
  nullValue?: 'NULL_VALUE';
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude: number; longitude: number };
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreWrite = {
  update?: FirestoreDocument;
  delete?: string;
  currentDocument?: { exists?: boolean };
  updateMask?: { fieldPaths: string[] };
};

type RunQueryResponse = Array<{
  document?: FirestoreDocument;
}>;

function buildDocumentName(path: string): string {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

function getIntegrationDocPath(userId: string): string {
  return `users/${userId}/${GOOGLE_CALENDAR_INTEGRATION_COLLECTION}/${GOOGLE_CALENDAR_INTEGRATION_DOC_ID}`;
}

function getEventsCollectionPath(userId: string): string {
  return `users/${userId}/${GOOGLE_CALENDAR_EVENTS_COLLECTION}`;
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null) {
    return { nullValue: 'NULL_VALUE' };
  }
  if (value === undefined) {
    return { nullValue: 'NULL_VALUE' };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { doubleValue: 0 };
    }
    if (Number.isInteger(value)) {
      return { integerValue: value.toString() };
    }
    return { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === 'object') {
    const mapFields: Record<string, FirestoreValue> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (item === undefined) {
        return;
      }
      mapFields[key] = encodeValue(item);
    });
    return { mapValue: { fields: mapFields } };
  }
  return { nullValue: 'NULL_VALUE' };
}

function decodeValue(value: FirestoreValue | undefined): unknown {
  if (!value) {
    return undefined;
  }
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.integerValue !== undefined) {
    return Number(value.integerValue);
  }
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  if (value.booleanValue !== undefined) {
    return value.booleanValue;
  }
  if (value.nullValue !== undefined) {
    return null;
  }
  if (value.timestampValue !== undefined) {
    return value.timestampValue;
  }
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map((entry) => decodeValue(entry));
  }
  if (value.mapValue !== undefined) {
    const result: Record<string, unknown> = {};
    const fields = value.mapValue.fields ?? {};
    Object.entries(fields).forEach(([key, entry]) => {
      result[key] = decodeValue(entry);
    });
    return result;
  }
  return undefined;
}

function decodeDocument<T>(document: FirestoreDocument | undefined): T | null {
  if (!document?.fields) {
    return null;
  }
  const result: Record<string, unknown> = {};
  Object.entries(document.fields).forEach(([key, value]) => {
    result[key] = decodeValue(value);
  });
  return result as T;
}

async function firestoreFetch(token: string, path: string, init?: RequestInit) {
  const response = await fetch(`${FIRESTORE_BASE_URL}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  return response;
}

async function getDocument(token: string, docPath: string): Promise<GoogleCalendarIntegrationDoc | null> {
  const response = await firestoreFetch(token, buildDocumentName(docPath));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore ドキュメントの取得に失敗しました: ${text}`);
  }
  const payload = (await response.json()) as FirestoreDocument;
  return decodeDocument<GoogleCalendarIntegrationDoc>(payload);
}

async function commitWrites(token: string, writes: FirestoreWrite[]): Promise<void> {
  if (writes.length === 0) {
    return;
  }
  const response = await firestoreFetch(
    token,
    `projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      body: JSON.stringify({ writes }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore への書き込みに失敗しました: ${text}`);
  }
}

async function runQuery(token: string, parentPath: string, calendarId: string): Promise<RunQueryResponse> {
  const body = {
    parent: buildDocumentName(parentPath),
    structuredQuery: {
      from: [{ collectionId: GOOGLE_CALENDAR_EVENTS_COLLECTION }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'calendarId' },
          op: 'EQUAL',
          value: { stringValue: calendarId },
        },
      },
    },
  };
  const response = await firestoreFetch(
    token,
    `projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore クエリの実行に失敗しました: ${text}`);
  }
  return (await response.json()) as RunQueryResponse;
}

function buildUpdateWrite(docPath: string, data: Record<string, unknown>): FirestoreWrite {
  const fieldPaths = Object.keys(data);
  return {
    update: {
      name: buildDocumentName(docPath),
      fields: encodeValue(data).mapValue?.fields ?? {},
    },
    updateMask: { fieldPaths },
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function createServerSyncStore(token: string): GoogleCalendarSyncStore {
  return {
    async loadIntegration(userId: string): Promise<GoogleCalendarIntegrationDoc | null> {
      return getDocument(token, getIntegrationDocPath(userId));
    },
    async ensureIntegration(userId: string): Promise<void> {
      const existing = await getDocument(token, getIntegrationDocPath(userId));
      if (existing) {
        return;
      }
      const payload = buildInitialIntegrationDocument();
      await commitWrites(token, [
        {
          update: {
            name: buildDocumentName(getIntegrationDocPath(userId)),
            fields: encodeValue(payload).mapValue?.fields ?? {},
          },
          currentDocument: { exists: false },
        },
      ]);
    },
    async updateIntegration(userId: string, data: Partial<GoogleCalendarIntegrationDoc>): Promise<void> {
      if (Object.keys(data).length === 0) {
        return;
      }
      await commitWrites(token, [buildUpdateWrite(getIntegrationDocPath(userId), data as Record<string, unknown>)]);
    },
    async upsertEvents(userId: string, events: GoogleCalendarEventRecord[]): Promise<void> {
      if (events.length === 0) {
        return;
      }
      const batches = chunkArray(events, GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH);
      for (const batch of batches) {
        const writes: FirestoreWrite[] = batch.map((event) => ({
          update: {
            name: buildDocumentName(`${getEventsCollectionPath(userId)}/${event.eventUid}`),
            fields: encodeValue(event).mapValue?.fields ?? {},
          },
        }));
        await commitWrites(token, writes);
      }
    },
    async removeEvents(userId: string, eventUids: string[]): Promise<void> {
      if (eventUids.length === 0) {
        return;
      }
      const batches = chunkArray(eventUids, GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH);
      for (const batch of batches) {
        const writes: FirestoreWrite[] = batch.map((eventUid) => ({
          delete: buildDocumentName(`${getEventsCollectionPath(userId)}/${eventUid}`),
        }));
        await commitWrites(token, writes);
      }
    },
    async listEventUidsByCalendar(userId: string, calendarId: string): Promise<string[]> {
      const results = await runQuery(token, `users/${userId}`, calendarId);
      const ids: string[] = [];
      results.forEach((entry) => {
        if (!entry.document?.name) {
          return;
        }
        const segments = entry.document.name.split('/');
        ids.push(segments[segments.length - 1]);
      });
      return ids;
    },
  } satisfies GoogleCalendarSyncStore;
}
