import { NextResponse } from 'next/server';

import { extractAuthContext } from '@/lib/auth/serverAuth';
import { ensureIntegrationDocument, loadIntegrationDocument, syncGoogleCalendar } from '@/lib/google-calendar/sync';
import { createServerSyncStore } from '@/lib/google-calendar/stores/serverStore';
import { GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS } from '@/lib/google-calendar/syncPolicies';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = extractAuthContext(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'Googleカレンダー同期にはログインが必要です。' },
        { status: 401 },
      );
    }

    const store = createServerSyncStore(auth.token);
    await ensureIntegrationDocument(store, auth.uid);
    const integration = await loadIntegrationDocument(store, auth.uid);
    if (!integration) {
      return NextResponse.json(
        { error: 'integration_not_found', error_description: 'Googleカレンダー連携設定が見つかりません。' },
        { status: 404 },
      );
    }

    if (!integration.refreshToken) {
      return NextResponse.json(
        { error: 'reauth_required', error_description: 'Googleカレンダーの再認証が必要です。' },
        { status: 400 },
      );
    }

    if (integration.lastSyncStatus === 'syncing') {
      return NextResponse.json(
        { error: 'sync_in_progress', error_description: 'Googleカレンダー同期が既に実行中です。' },
        { status: 409 },
      );
    }

    const now = Date.now();
    if (integration.lastSyncedAt && now - integration.lastSyncedAt < GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS) {
      const retryAfterMs = GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS - (now - integration.lastSyncedAt);
      return NextResponse.json(
        {
          error: 'sync_rate_limited',
          error_description: '前回の同期から十分な時間が経過していません。',
          retryAfterMs,
        },
        {
          status: 429,
          headers: { 'Retry-After': Math.ceil(retryAfterMs / 1000).toString() },
        },
      );
    }

    await store.updateIntegration(auth.uid, {
      lastSyncStatus: 'syncing',
      lastSyncError: null,
      updatedAt: now,
    });

    try {
      const result = await syncGoogleCalendar(store, auth.uid, integration);
      await store.updateIntegration(auth.uid, {
        lastSyncStatus: 'idle',
        lastSyncError: null,
        updatedAt: Date.now(),
      });
      return NextResponse.json({
        status: 'ok',
        syncedCalendars: result.syncedCalendars,
        upsertedCount: result.upsertedEvents.length,
        removedCount: result.removedEventUids.length,
      });
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : 'Googleカレンダーの同期に失敗しました。時間をおいて再度お試しください。';
      await store.updateIntegration(auth.uid, {
        lastSyncStatus: 'error',
        lastSyncError: message,
        updatedAt: Date.now(),
      });
      console.error('Google カレンダー同期処理に失敗しました。', syncError);
      return NextResponse.json({ error: 'sync_failed', error_description: message }, { status: 500 });
    }
  } catch (error) {
    console.error('Google カレンダー同期APIの実行に失敗しました。', error);
    return NextResponse.json(
      { error: 'internal_error', error_description: 'Googleカレンダーの同期に失敗しました。' },
      { status: 500 },
    );
  }
}
