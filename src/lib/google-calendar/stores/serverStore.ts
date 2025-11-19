import type { GoogleCalendarEventRecord, GoogleCalendarIntegrationDoc } from '../types';
import type { GoogleCalendarSyncStore } from '../syncStore';
import { buildInitialIntegrationDocument } from '../defaults';
import {
  GOOGLE_CALENDAR_EVENTS_COLLECTION,
  GOOGLE_CALENDAR_INTEGRATION_COLLECTION,
  GOOGLE_CALENDAR_INTEGRATION_DOC_ID,
  GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH,
} from '../constants';
import { getAdminDb } from '@/lib/firebase/admin';

function getIntegrationDocPath(userId: string): string {
  return `users/${userId}/${GOOGLE_CALENDAR_INTEGRATION_COLLECTION}/${GOOGLE_CALENDAR_INTEGRATION_DOC_ID}`;
}

function getEventsCollectionPath(userId: string): string {
  return `users/${userId}/${GOOGLE_CALENDAR_EVENTS_COLLECTION}`;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function createServerSyncStore(): GoogleCalendarSyncStore {
  const db = getAdminDb();

  return {
    async loadIntegration(userId: string): Promise<GoogleCalendarIntegrationDoc | null> {
      try {
        const docRef = db.doc(getIntegrationDocPath(userId));
        const snapshot = await docRef.get();
        
        if (!snapshot.exists) {
          return null;
        }
        
        const data = snapshot.data() as GoogleCalendarIntegrationDoc;
        return data;
      } catch (error) {
        throw error;
      }
    },

    async ensureIntegration(userId: string): Promise<void> {

      try {
        const docRef = db.doc(getIntegrationDocPath(userId));
        const snapshot = await docRef.get();
        
        if (snapshot.exists) {
          return;
        }
        
        const payload = buildInitialIntegrationDocument();
        await docRef.create(payload);
      } catch (error) {
        console.error(`[ServerStore] 連携ドキュメント確保エラー: ${userId}`, error);
        throw error;
      }
    },

    async updateIntegration(userId: string, data: Partial<GoogleCalendarIntegrationDoc>): Promise<void> {
      if (Object.keys(data).length === 0) {
        return;
      }
      
      console.log(`[ServerStore] 連携ドキュメント更新開始: ${userId}, フィールド数: ${Object.keys(data).length}`);
      try {
        const docRef = db.doc(getIntegrationDocPath(userId));
        await docRef.update(data);
      } catch (error) {
        console.error(`[ServerStore] 連携ドキュメント更新エラー: ${userId}`, error);
        throw error;
      }
    },

    async upsertEvents(userId: string, events: GoogleCalendarEventRecord[]): Promise<void> {
      if (events.length === 0) {
        return;
      }
      try {
        const batches = chunkArray(events, GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH);
        
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const writeBatch = db.batch();
          
          batch.forEach((event) => {
            const docRef = db.doc(`${getEventsCollectionPath(userId)}/${event.eventUid}`);
            writeBatch.set(docRef, event);
          });
          
          await writeBatch.commit();
          console.log(`[ServerStore] バッチ ${i + 1}/${batches.length} 完了: ${batch.length}件`);
        }
      } catch (error) {
        console.error(`[ServerStore] イベント一括更新エラー: ${userId}`, error);
        throw error;
      }
    },

    async removeEvents(userId: string, eventUids: string[]): Promise<void> {
      if (eventUids.length === 0) {
        return;
      }
      try {
        const batches = chunkArray(eventUids, GOOGLE_CALENDAR_MAX_EVENTS_PER_BATCH);
        
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const writeBatch = db.batch();
          
          batch.forEach((eventUid) => {
            const docRef = db.doc(`${getEventsCollectionPath(userId)}/${eventUid}`);
            writeBatch.delete(docRef);
          });
          
          await writeBatch.commit();
        }
      } catch (error) {
        console.error(`[ServerStore] イベント一括削除エラー: ${userId}`, error);
        throw error;
      }
    },

    async listEventUidsByCalendar(userId: string, calendarId: string): Promise<string[]> {
      try {
        const collectionRef = db.collection(getEventsCollectionPath(userId));
        const query = collectionRef.where('calendarId', '==', calendarId);
        const snapshot = await query.get();
        
        const eventUids: string[] = [];
        snapshot.forEach((doc) => {
          eventUids.push(doc.id);
        });        
        return eventUids;
      } catch (error) {
        console.error(`[ServerStore] カレンダーイベントUID一覧取得エラー: ${userId}, カレンダー: ${calendarId}`, error);
        throw error;
      }
    },
  } satisfies GoogleCalendarSyncStore;
}
