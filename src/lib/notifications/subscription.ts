'use client';

import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/client';

const CALENDAR_COLLECTION = 'notification_subscriptions';

function buildCalendarKey(fiscalYear: string, calendarId: string): string {
  return `${fiscalYear}__${calendarId}`;
}

type SyncParams = {
  token: string;
  uid: string;
  fiscalYear: string;
  calendarId: string;
};

export async function syncCalendarNotificationToken({
  token,
  uid,
  fiscalYear,
  calendarId,
}: SyncParams): Promise<void> {
  const trimmedFiscalYear = fiscalYear.trim();
  const trimmedCalendarId = calendarId.trim();
  if (!trimmedFiscalYear || !trimmedCalendarId) {
    throw new Error('Fiscal year or calendar ID is empty.');
  }
  if (!token.trim()) {
    throw new Error('FCM token is empty.');
  }

  const calendarKey = buildCalendarKey(trimmedFiscalYear, trimmedCalendarId);

  const userTokenRef = doc(db, 'users', uid, 'notification_tokens', token);
  const userTokenSnapshot = await getDoc(userTokenRef);
  const previousCalendarKey = userTokenSnapshot.exists()
    ? typeof userTokenSnapshot.data()?.calendarKey === 'string'
      ? (userTokenSnapshot.data()?.calendarKey as string)
      : null
    : null;

  const now = serverTimestamp();
  const baseData = {
    token,
    uid,
    fiscalYear: trimmedFiscalYear,
    calendarId: trimmedCalendarId,
    calendarKey,
    updatedAt: now,
  } as const;

  await setDoc(userTokenRef, baseData, { merge: true });

  const calendarTokenRef = doc(db, CALENDAR_COLLECTION, calendarKey, 'tokens', token);
  await setDoc(calendarTokenRef, baseData, { merge: true });

  if (previousCalendarKey && previousCalendarKey !== calendarKey) {
    const previousCalendarTokenRef = doc(
      db,
      CALENDAR_COLLECTION,
      previousCalendarKey,
      'tokens',
      token,
    );
    try {
      await deleteDoc(previousCalendarTokenRef);
    } catch (error) {
      console.warn('Failed to remove previous calendar notification token.', error);
    }
  }
}
