import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/client';
import { deleteIntegrationDocument, removeAllGoogleCalendarEvents } from '@/lib/google-calendar/firestore';

const DELETE_BATCH_LIMIT = 200;

async function deleteCollectionInBatches(
  collectionRef: CollectionReference<DocumentData>,
  options?: {
    beforeDeleteDoc?: (docSnapshot: QueryDocumentSnapshot<DocumentData>) => Promise<void>;
  },
) {
  while (true) {
    const snapshot = await getDocs(query(collectionRef, limit(DELETE_BATCH_LIMIT)));
    if (snapshot.empty) {
      break;
    }

    if (options?.beforeDeleteDoc) {
      for (const docSnapshot of snapshot.docs) {
        await options.beforeDeleteDoc(docSnapshot);
      }
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
    });
    await batch.commit();
  }
}

async function deleteActivities(userId: string): Promise<void> {
  const activitiesRef = collection(db, 'users', userId, 'activities');
  await deleteCollectionInBatches(activitiesRef, {
    beforeDeleteDoc: async (docSnapshot) => {
      const attachmentsRef = collection(docSnapshot.ref, 'attachments');
      await deleteCollectionInBatches(attachmentsRef);
    },
  });
}

async function deleteAcademicYears(userId: string): Promise<void> {
  const academicYearsRef = collection(db, 'users', userId, 'academic_years');
  const academicYearsSnapshot = await getDocs(academicYearsRef);

  for (const yearDoc of academicYearsSnapshot.docs) {
    const yearRef = yearDoc.ref;

    await deleteCollectionInBatches(collection(yearRef, 'timetable_classes'), {
      beforeDeleteDoc: async (classDoc) => {
        await deleteCollectionInBatches(collection(classDoc.ref, 'weekly_slots'));
      },
    });

    await deleteCollectionInBatches(collection(yearRef, 'class_dates'));

    await deleteCollectionInBatches(collection(yearRef, 'class_time_sets'), {
      beforeDeleteDoc: async (timeSetDoc) => {
        await deleteCollectionInBatches(collection(timeSetDoc.ref, 'periods'));
      },
    });

    await deleteDoc(yearRef);
  }
}

async function deleteUserCalendars(userId: string): Promise<void> {
  const calendarsRef = collection(db, 'users', userId, 'calendars');
  const calendarsSnapshot = await getDocs(calendarsRef);

  for (const calendarDoc of calendarsSnapshot.docs) {
    const calendarRef = calendarDoc.ref;
    await deleteCollectionInBatches(collection(calendarRef, 'days'));
    await deleteCollectionInBatches(collection(calendarRef, 'terms'));
    await deleteCollectionInBatches(collection(calendarRef, 'campuses'));
    await deleteDoc(calendarRef);
  }
}

async function deleteUserSettings(userId: string): Promise<void> {
  const settingsRef = collection(db, 'users', userId, 'settings');
  await deleteCollectionInBatches(settingsRef);
}

export async function deleteAllUserData(userId: string): Promise<void> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    throw new Error('ユーザーIDを指定してください。');
  }

  await Promise.all([
    deleteActivities(trimmedUserId),
    deleteAcademicYears(trimmedUserId),
    deleteUserCalendars(trimmedUserId),
    deleteUserSettings(trimmedUserId),
    removeAllGoogleCalendarEvents(db, trimmedUserId).catch((error) => {
      console.warn('Googleカレンダーイベントの削除に失敗しました。', error);
    }),
    deleteIntegrationDocument(db, trimmedUserId).catch((error) => {
      console.warn('Googleカレンダー連携ドキュメントの削除に失敗しました。', error);
    }),
  ]);

  const userDocRef = doc(db, 'users', trimmedUserId);
  await deleteDoc(userDocRef);
}
