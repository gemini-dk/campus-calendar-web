import { NextResponse } from 'next/server';

import { extractAuthContext } from '@/lib/auth/serverAuth';
import {
  ensureIntegrationDocument,
  fetchCalendarList,
  loadIntegrationDocument,
  mergeCalendarSelections,
  refreshAccessToken,
} from '@/lib/google-calendar/sync';
import { createServerSyncStore } from '@/lib/google-calendar/stores/serverStore';

function parseSelectedCalendarIds(payload: unknown): string[] | null {
  if (!Array.isArray(payload)) {
    return null;
  }
  const ids = payload.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return Array.from(new Set(ids));
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = extractAuthContext(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'Googleカレンダーの読み込みにはログインが必要です。' },
        { status: 401 },
      );
    }

    const store = createServerSyncStore();
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

    let accessToken = integration.accessToken ?? '';
    let expiresAt = integration.expiresAt ?? 0;
    const now = Date.now();

    if (!accessToken || expiresAt - 60_000 <= now) {
      const refreshed = await refreshAccessToken(integration.refreshToken);
      accessToken = refreshed.accessToken;
      expiresAt = refreshed.expiresAt;
      await store.updateIntegration(auth.uid, {
        accessToken,
        expiresAt,
        scope: refreshed.scope,
        tokenType: refreshed.tokenType,
        updatedAt: Date.now(),
      });
    }

    const fetchedList = await fetchCalendarList(accessToken);
    const calendarList = mergeCalendarSelections(integration.calendarList, fetchedList);

    await store.updateIntegration(auth.uid, {
      calendarList,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ calendars: calendarList });
  } catch (error) {
    console.error('[GoogleCalendar CalendarList] 一覧取得エラー', error);
    return NextResponse.json(
      { error: 'internal_error', error_description: 'Googleカレンダー一覧の取得に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const auth = extractAuthContext(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'Googleカレンダーの更新にはログインが必要です。' },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const selectedCalendarIds = parseSelectedCalendarIds((body as { selectedCalendarIds?: unknown } | null)?.selectedCalendarIds);
    if (!selectedCalendarIds) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: '選択するカレンダーのID一覧を指定してください。' },
        { status: 400 },
      );
    }

    const store = createServerSyncStore();
    await ensureIntegrationDocument(store, auth.uid);

    const integration = await loadIntegrationDocument(store, auth.uid);
    if (!integration) {
      return NextResponse.json(
        { error: 'integration_not_found', error_description: 'Googleカレンダー連携設定が見つかりません。' },
        { status: 404 },
      );
    }

    if (!integration.calendarList) {
      return NextResponse.json(
        { error: 'calendar_list_missing', error_description: 'カレンダー一覧がまだ取得されていません。先に一覧を更新してください。' },
        { status: 400 },
      );
    }

    const selectedSet = new Set(selectedCalendarIds);

    const updatedCalendarList = integration.calendarList.map((entry) => ({
      ...entry,
      selected: selectedSet.has(entry.id),
    }));

    const removedCalendars = integration.calendarList
      .filter((entry) => entry.selected && !selectedSet.has(entry.id))
      .map((entry) => entry.id);

    const filteredSyncTokens = integration.syncTokens
      ? Object.fromEntries(Object.entries(integration.syncTokens).filter(([calendarId]) => selectedSet.has(calendarId)))
      : {};

    await store.updateIntegration(auth.uid, {
      calendarList: updatedCalendarList,
      syncTokens: filteredSyncTokens,
      updatedAt: Date.now(),
    });

    if (removedCalendars.length > 0) {
      for (const calendarId of removedCalendars) {
        const eventUids = await store.listEventUidsByCalendar(auth.uid, calendarId);
        if (eventUids.length > 0) {
          await store.removeEvents(auth.uid, eventUids);
        }
      }
    }

    return NextResponse.json({ calendars: updatedCalendarList });
  } catch (error) {
    console.error('[GoogleCalendar CalendarList] 選択更新エラー', error);
    return NextResponse.json(
      { error: 'internal_error', error_description: 'Googleカレンダーの選択更新に失敗しました。' },
      { status: 500 },
    );
  }
}
