'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/useAuth';

import { GOOGLE_CALENDAR_EVENTS_COLLECTION } from '../constants';
import type { GoogleCalendarEventRecord } from '../types';

function mapEventSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): GoogleCalendarEventRecord | null {
  const data = snapshot.data();
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  return {
    calendarId: String(data.calendarId ?? ''),
    eventId: String(data.eventId ?? snapshot.id),
    eventUid: String(data.eventUid ?? snapshot.id),
    summary: typeof data.summary === 'string' ? data.summary : '(予定なし)',
    description: typeof data.description === 'string' ? data.description : null,
    location: typeof data.location === 'string' ? data.location : null,
    startDateKey: typeof data.startDateKey === 'string' ? data.startDateKey : '',
    endDateKey: typeof data.endDateKey === 'string' ? data.endDateKey : '',
    startTimestamp: typeof data.startTimestamp === 'number' ? data.startTimestamp : 0,
    endTimestamp: typeof data.endTimestamp === 'number' ? data.endTimestamp : 0,
    allDay: data.allDay === true,
    dayKeys: Array.isArray(data.dayKeys) ? (data.dayKeys as string[]) : [],
    monthKeys: Array.isArray(data.monthKeys) ? (data.monthKeys as string[]) : [],
    fiscalYearKeys: Array.isArray(data.fiscalYearKeys) ? (data.fiscalYearKeys as string[]) : [],
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    status: typeof data.status === 'string' ? data.status : 'confirmed',
    htmlLink: typeof data.htmlLink === 'string' ? data.htmlLink : null,
    hangoutLink: typeof data.hangoutLink === 'string' ? data.hangoutLink : null,
    organizer:
      data.organizer && typeof data.organizer === 'object'
        ? {
            displayName:
              typeof (data.organizer as Record<string, unknown>).displayName === 'string'
                ? String((data.organizer as Record<string, unknown>).displayName)
                : null,
            email:
              typeof (data.organizer as Record<string, unknown>).email === 'string'
                ? String((data.organizer as Record<string, unknown>).email)
                : null,
          }
        : null,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    colorId: typeof data.colorId === 'string' ? data.colorId : null,
    startRaw:
      data.startRaw && typeof data.startRaw === 'object'
        ? {
            dateTime:
              typeof (data.startRaw as Record<string, unknown>).dateTime === 'string'
                ? String((data.startRaw as Record<string, unknown>).dateTime)
                : null,
            date:
              typeof (data.startRaw as Record<string, unknown>).date === 'string'
                ? String((data.startRaw as Record<string, unknown>).date)
                : null,
            timeZone:
              typeof (data.startRaw as Record<string, unknown>).timeZone === 'string'
                ? String((data.startRaw as Record<string, unknown>).timeZone)
                : null,
          }
        : { dateTime: null, date: null, timeZone: null },
    endRaw:
      data.endRaw && typeof data.endRaw === 'object'
        ? {
            dateTime:
              typeof (data.endRaw as Record<string, unknown>).dateTime === 'string'
                ? String((data.endRaw as Record<string, unknown>).dateTime)
                : null,
            date:
              typeof (data.endRaw as Record<string, unknown>).date === 'string'
                ? String((data.endRaw as Record<string, unknown>).date)
                : null,
            timeZone:
              typeof (data.endRaw as Record<string, unknown>).timeZone === 'string'
                ? String((data.endRaw as Record<string, unknown>).timeZone)
                : null,
          }
        : { dateTime: null, date: null, timeZone: null },
  } satisfies GoogleCalendarEventRecord;
}

type UseGoogleCalendarEventsOptions = {
  enabled?: boolean;
};

export function useGoogleCalendarEventsForMonth(
  monthKey: string,
  options?: UseGoogleCalendarEventsOptions,
) {
  const { profile } = useAuth();
  const userId = profile?.uid ?? null;
  const [events, setEvents] = useState<GoogleCalendarEventRecord[]>([]);
  const isEnabled = options?.enabled ?? true;
  const [loading, setLoading] = useState(isEnabled);

  useEffect(() => {
    if (!isEnabled) {
      setEvents([]);
      setLoading(false);
      return;
    }

    if (!userId || !monthKey) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const collectionRef = collection(db, 'users', userId, GOOGLE_CALENDAR_EVENTS_COLLECTION);
    const monthQuery = query(
      collectionRef,
      where('monthKeys', 'array-contains', monthKey),
      orderBy('startTimestamp'),
    );

    setLoading(true);
    const unsubscribe = onSnapshot(
      monthQuery,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((docSnapshot) => mapEventSnapshot(docSnapshot))
          .filter((item): item is GoogleCalendarEventRecord => item !== null);
        setEvents(mapped);
        setLoading(false);
      },
      (error) => {
        console.error('Google カレンダーイベントの取得に失敗しました。', error);
        setEvents([]);
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [isEnabled, monthKey, userId]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, GoogleCalendarEventRecord[]> = {};
    events.forEach((event) => {
      event.dayKeys.forEach((dayKey) => {
        if (!map[dayKey]) {
          map[dayKey] = [];
        }
        map[dayKey].push(event);
      });
    });
    Object.keys(map).forEach((dayKey) => {
      map[dayKey].sort((a, b) => a.startTimestamp - b.startTimestamp);
    });
    return map;
  }, [events]);

  return { events, eventsByDay, loading } as const;
}

export function useGoogleCalendarEventsForDay(
  dateId: string,
  options?: UseGoogleCalendarEventsOptions,
) {
  const { profile } = useAuth();
  const userId = profile?.uid ?? null;
  const [events, setEvents] = useState<GoogleCalendarEventRecord[]>([]);
  const isEnabled = options?.enabled ?? true;
  const [loading, setLoading] = useState(isEnabled);

  useEffect(() => {
    if (!isEnabled) {
      setEvents([]);
      setLoading(false);
      return;
    }

    if (!userId || !dateId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const collectionRef = collection(db, 'users', userId, GOOGLE_CALENDAR_EVENTS_COLLECTION);
    const dayQuery = query(
      collectionRef,
      where('dayKeys', 'array-contains', dateId),
      orderBy('startTimestamp'),
    );

    setLoading(true);
    const unsubscribe = onSnapshot(
      dayQuery,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((docSnapshot) => mapEventSnapshot(docSnapshot))
          .filter((item): item is GoogleCalendarEventRecord => item !== null);
        setEvents(mapped);
        setLoading(false);
      },
      (error) => {
        console.error('Google カレンダー日別イベントの取得に失敗しました。', error);
        setEvents([]);
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [dateId, isEnabled, userId]);

  return { events, loading } as const;
}
