import { getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

import { db } from '@/lib/firebase/client';

import type {
  GoogleCalendarEventRecord,
  GoogleCalendarIntegrationDoc,
  GoogleCalendarListEntry,
  GoogleCalendarEventSyncResult,
} from './types';
import {
  enumerateDateKeys,
  enumerateFiscalYearKeys,
  enumerateMonthKeys,
  toDateKey,
  toTimestamp,
} from './utils';
import {
  getEventsCollectionRef,
  getIntegrationDocRef,
  removeGoogleCalendarEvents,
  upsertGoogleCalendarEvents,
} from './firestore';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_LIST_ENDPOINT = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
const CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars';

export type SyncOptions = {
  forceFullSync?: boolean;
  timeMin?: string;
  timeMax?: string;
};

export async function loadIntegrationDocument(userId: string): Promise<GoogleCalendarIntegrationDoc | null> {
  const ref = getIntegrationDocRef(db, userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as GoogleCalendarIntegrationDoc;
}

export async function ensureIntegrationDocument(userId: string): Promise<void> {
  const ref = getIntegrationDocRef(db, userId);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    return;
  }
  const payload: GoogleCalendarIntegrationDoc = {
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
    updatedAt: Date.now(),
  };
  await setDoc(ref, payload);
}

export async function syncGoogleCalendar(
  userId: string,
  integration: GoogleCalendarIntegrationDoc,
  options: SyncOptions = {},
): Promise<GoogleCalendarEventSyncResult> {
  if (!integration.refreshToken) {
    throw new Error('Google カレンダーの再認証が必要です。');
  }

  const now = Date.now();
  let accessToken = integration.accessToken ?? '';
  let expiresAt = integration.expiresAt ?? 0;

  if (!accessToken || expiresAt - 60_000 <= now) {
    const refreshed = await refreshAccessToken(integration.refreshToken);
    accessToken = refreshed.accessToken;
    expiresAt = refreshed.expiresAt;
    await setDoc(
      getIntegrationDocRef(db, userId),
      {
        accessToken,
        expiresAt,
        scope: refreshed.scope,
        tokenType: refreshed.tokenType,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  }

  const { timeMin, timeMax } = resolveTimeRange(options);

  const calendarList = await fetchCalendarList(accessToken);
  const selectedCalendars = calendarList.filter((entry) => entry.selected !== false);

  const syncTokens = integration.syncTokens ?? {};
  const nextSyncTokens: Record<string, string> = { ...syncTokens };
  const upserted: GoogleCalendarEventRecord[] = [];
  const removed: string[] = [];
  const syncedCalendars: string[] = [];

  for (const calendar of selectedCalendars) {
    const calendarId = calendar.id;
    const encodedCalendarId = encodeURIComponent(calendar.id);
    const existingToken = options.forceFullSync ? undefined : syncTokens[calendarId];

    const syncResult = await fetchCalendarEvents({
      accessToken,
      calendarId: encodedCalendarId,
      syncToken: existingToken,
      timeMin,
      timeMax,
    });

    if (syncResult.resetRequired) {
      await removeCalendarEvents(userId, calendarId);
      nextSyncTokens[calendarId] = '';
      const resetResult = await fetchCalendarEvents({
        accessToken,
        calendarId: encodedCalendarId,
        timeMin,
        timeMax,
      });
      if (resetResult.events.length > 0) {
        upserted.push(...resetResult.events.map((event) => mapEventRecord(calendarId, event)));
      }
      if (resetResult.cancelledIds.length > 0) {
        removed.push(
          ...resetResult.cancelledIds.map((eventId) => buildEventUid(calendarId, eventId)),
        );
      }
      if (resetResult.nextSyncToken) {
        nextSyncTokens[calendarId] = resetResult.nextSyncToken;
      }
      syncedCalendars.push(calendarId);
      continue;
    }

    if (syncResult.events.length > 0) {
      upserted.push(...syncResult.events.map((event) => mapEventRecord(calendarId, event)));
    }

    if (syncResult.cancelledIds.length > 0) {
      removed.push(
        ...syncResult.cancelledIds.map((eventId) => buildEventUid(calendarId, eventId)),
      );
    }

    if (syncResult.nextSyncToken) {
      nextSyncTokens[calendarId] = syncResult.nextSyncToken;
    }

    syncedCalendars.push(calendarId);
  }

  if (upserted.length > 0) {
    await upsertGoogleCalendarEvents(db, userId, upserted);
  }

  if (removed.length > 0) {
    await removeGoogleCalendarEvents(db, userId, removed);
  }

  await setDoc(
    getIntegrationDocRef(db, userId),
    {
      calendarList,
      syncTokens: nextSyncTokens,
      lastSyncedAt: Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true },
  );

  return {
    syncedCalendars,
    nextSyncTokens,
    removedEventUids: removed,
    upsertedEvents: upserted,
    refreshedAccessToken: accessToken,
    accessTokenExpiresAt: expiresAt,
  };
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

type RefreshResult = {
  accessToken: string;
  expiresAt: number;
  scope: string | null;
  tokenType: string | null;
};

async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID ?? '',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google カレンダーのトークン更新に失敗しました: ${errorText}`);
  }

  const payload = (await response.json()) as TokenResponse;
  const expiresAt = Date.now() + (payload.expires_in ?? 3600) * 1000;
  return {
    accessToken: payload.access_token,
    expiresAt,
    scope: payload.scope ?? null,
    tokenType: payload.token_type ?? null,
  };
}

type CalendarListResponse = {
  items: Array<{ [key: string]: unknown }>;
};

async function fetchCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const response = await fetch(`${CALENDAR_LIST_ENDPOINT}?minAccessRole=reader`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google カレンダー一覧の取得に失敗しました: ${errorText}`);
  }

  const payload = (await response.json()) as CalendarListResponse;
  return (payload.items ?? [])
    .map((item) => mapCalendarListEntry(item))
    .filter((entry): entry is GoogleCalendarListEntry => entry !== null);
}

function mapCalendarListEntry(item: { [key: string]: unknown }): GoogleCalendarListEntry | null {
  const id = typeof item.id === 'string' ? item.id : null;
  if (!id) {
    return null;
  }
  const summary = typeof item.summary === 'string' ? item.summary : id;
  const primary = item.primary === true;
  const accessRole = typeof item.accessRole === 'string' ? item.accessRole : 'reader';
  const backgroundColor = typeof item.backgroundColor === 'string' ? item.backgroundColor : null;
  const foregroundColor = typeof item.foregroundColor === 'string' ? item.foregroundColor : null;
  const selected = item.selected !== false;
  return {
    id,
    summary,
    primary,
    accessRole,
    backgroundColor,
    foregroundColor,
    selected,
  } satisfies GoogleCalendarListEntry;
}

type FetchEventsOptions = {
  accessToken: string;
  calendarId: string;
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
};

type RawCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  created?: string;
  updated?: string;
  colorId?: string;
  organizer?: {
    displayName?: string;
    email?: string;
  };
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
};

type EventsResponse = {
  items?: RawCalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
};

type FetchEventsResult = {
  events: RawCalendarEvent[];
  cancelledIds: string[];
  nextSyncToken: string | null;
  resetRequired: boolean;
};

type TimeRange = {
  timeMin: string;
  timeMax: string;
};

function resolveTimeRange(options: SyncOptions): TimeRange {
  if (options.timeMin && options.timeMax) {
    return { timeMin: options.timeMin, timeMax: options.timeMax };
  }
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 6);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  end.setMonth(end.getMonth() + 1);
  end.setDate(0);
  end.setHours(23, 59, 59, 999);
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

async function fetchCalendarEvents(options: FetchEventsOptions): Promise<FetchEventsResult> {
  const params = new URLSearchParams({
    singleEvents: 'true',
    showDeleted: 'true',
    maxResults: '2500',
    orderBy: 'updated',
  });

  if (options.syncToken) {
    params.set('syncToken', options.syncToken);
  } else {
    if (options.timeMin) {
      params.set('timeMin', options.timeMin);
    }
    if (options.timeMax) {
      params.set('timeMax', options.timeMax);
    }
  }

  let nextPageToken: string | undefined;
  const events: RawCalendarEvent[] = [];
  const cancelledIds: string[] = [];
  let nextSyncToken: string | null = null;

  try {
    do {
      const url = new URL(`${CALENDAR_EVENTS_ENDPOINT}/${options.calendarId}/events`);
      params.forEach((value, key) => {
        url.searchParams.set(key, value);
      });
      if (nextPageToken) {
        url.searchParams.set('pageToken', nextPageToken);
      }
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
        },
      });
      if (!response.ok) {
        if (response.status === 410) {
          return { events: [], cancelledIds: [], nextSyncToken: null, resetRequired: true };
        }
        const errorText = await response.text();
        throw new Error(`Google カレンダー予定の取得に失敗しました: ${errorText}`);
      }
      const payload = (await response.json()) as EventsResponse;
      const items = payload.items ?? [];
      items.forEach((item) => {
        const id = typeof item.id === 'string' ? item.id : null;
        if (!id) {
          return;
        }
        if (item.status === 'cancelled') {
          cancelledIds.push(id);
          return;
        }
        events.push(item);
      });
      nextSyncToken = typeof payload.nextSyncToken === 'string' ? payload.nextSyncToken : nextSyncToken;
      nextPageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : undefined;
    } while (nextPageToken);
  } catch (error) {
    if (error instanceof Error && error.message.includes('syncToken')) {
      return { events: [], cancelledIds: [], nextSyncToken: null, resetRequired: true };
    }
    throw error;
  }

  return { events, cancelledIds, nextSyncToken, resetRequired: false };
}

function buildEventUid(calendarId: string, eventId: string): string {
  return `${calendarId}__${eventId}`;
}

function mapEventRecord(calendarId: string, raw: RawCalendarEvent): GoogleCalendarEventRecord {
  const eventId = raw.id ?? generateFallbackEventId();
  const startDate = extractStartDate(raw);
  const endDate = extractEndDate(raw);
  const startTimestamp = toTimestamp(raw.start?.dateTime ?? raw.start?.date) ?? Date.now();
  const endTimestamp = toTimestamp(raw.end?.dateTime ?? raw.end?.date) ?? startTimestamp;
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  const dayKeys = enumerateDateKeys(startDate, endDate);
  const monthKeys = enumerateMonthKeys(startDate, endDate);
  const fiscalYearKeys = enumerateFiscalYearKeys(startDate, endDate);
  return {
    calendarId,
    eventId,
    eventUid: buildEventUid(calendarId, eventId),
    summary: raw.summary ?? '(予定なし)',
    description: raw.description ?? null,
    location: raw.location ?? null,
    startDateKey: startKey,
    endDateKey: endKey,
    startTimestamp,
    endTimestamp,
    allDay: Boolean(raw.start?.date) && !raw.start?.dateTime,
    dayKeys,
    monthKeys,
    fiscalYearKeys,
    updatedAt: Date.now(),
    status: raw.status ?? 'confirmed',
    htmlLink: raw.htmlLink ?? null,
    hangoutLink: raw.hangoutLink ?? null,
    organizer: mapOrganizer(raw.organizer),
    createdAt: toTimestamp(raw.created) ?? Date.now(),
    colorId: raw.colorId ?? null,
    startRaw: {
      dateTime: raw.start?.dateTime ?? null,
      date: raw.start?.date ?? null,
      timeZone: raw.start?.timeZone ?? null,
    },
    endRaw: {
      dateTime: raw.end?.dateTime ?? null,
      date: raw.end?.date ?? null,
      timeZone: raw.end?.timeZone ?? null,
    },
  } satisfies GoogleCalendarEventRecord;
}

function generateFallbackEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `evt_${Math.random().toString(36).slice(2, 12)}`;
}

function extractStartDate(raw: RawCalendarEvent): Date {
  const dateTime = raw.start?.dateTime;
  const dateOnly = raw.start?.date;
  if (dateTime) {
    return new Date(dateTime);
  }
  if (dateOnly) {
    return new Date(`${dateOnly}T00:00:00Z`);
  }
  return new Date();
}

function extractEndDate(raw: RawCalendarEvent): Date {
  const dateTime = raw.end?.dateTime;
  const dateOnly = raw.end?.date;
  if (dateTime) {
    const endDate = new Date(dateTime);
    endDate.setMilliseconds(endDate.getMilliseconds() - 1);
    return endDate;
  }
  if (dateOnly) {
    const endDate = new Date(`${dateOnly}T00:00:00Z`);
    endDate.setDate(endDate.getDate() - 1);
    return endDate;
  }
  return new Date();
}

function mapOrganizer(organizer: RawCalendarEvent['organizer'] | undefined): {
  displayName: string | null;
  email: string | null;
} | null {
  if (!organizer) {
    return null;
  }
  const displayName = typeof organizer.displayName === 'string' ? organizer.displayName : null;
  const email = typeof organizer.email === 'string' ? organizer.email : null;
  if (!displayName && !email) {
    return null;
  }
  return { displayName, email };
}

async function removeCalendarEvents(userId: string, calendarId: string): Promise<void> {
  const eventsRef = getEventsCollectionRef(db, userId);
  const snapshot = await getDocs(query(eventsRef, where('calendarId', '==', calendarId)));
  if (snapshot.empty) {
    return;
  }
  await removeGoogleCalendarEvents(
    db,
    userId,
    snapshot.docs.map((docSnapshot) => docSnapshot.id),
  );
}
