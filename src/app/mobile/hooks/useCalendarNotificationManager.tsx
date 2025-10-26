'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';
import { getFcmToken, isMessagingSupported } from '@/lib/notifications/messaging';
import { syncCalendarNotificationToken } from '@/lib/notifications/subscription';

type NotificationPermissionState = NotificationPermission | 'unsupported';

type SyncState = 'idle' | 'syncing' | 'error';

type CalendarNotificationManagerValue = {
  supported: boolean;
  permission: NotificationPermissionState;
  syncState: SyncState;
  isRequesting: boolean;
  requestError: string | null;
  syncError: string | null;
  subscribe: () => Promise<boolean>;
};

const CalendarNotificationManagerContext =
  createContext<CalendarNotificationManagerValue | null>(null);

type ProviderProps = {
  children: React.ReactNode;
};

function useProvideCalendarNotificationManager(): CalendarNotificationManagerValue {
  const { settings } = useUserSettings();
  const { profile } = useAuth();

  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>('unsupported');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const lastSyncedKeyRef = useRef<string | null>(null);

  const fiscalYear = settings.calendar.fiscalYear.trim();
  const calendarId = settings.calendar.calendarId.trim();
  const calendarKey = fiscalYear && calendarId ? `${fiscalYear}__${calendarId}` : null;
  const uid = profile?.uid ?? null;

  useEffect(() => {
    let canceled = false;
    void (async () => {
      const available = await isMessagingSupported();
      if (canceled) {
        return;
      }
      setSupported(available);
      if (available && typeof Notification !== 'undefined') {
        setPermission(Notification.permission);
      } else {
        setPermission('unsupported');
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!supported || permission !== 'granted' || !calendarKey || !uid) {
      return;
    }

    if (lastSyncedKeyRef.current === calendarKey && syncState !== 'error') {
      return;
    }

    let canceled = false;
    setSyncState('syncing');
    setSyncError(null);

    void (async () => {
      try {
        const token = await getFcmToken(false);
        if (!token) {
          throw new Error('Failed to obtain FCM token.');
        }
        if (canceled) {
          return;
        }
        await syncCalendarNotificationToken({
          token,
          uid,
          fiscalYear,
          calendarId,
        });
        if (canceled) {
          return;
        }
        lastSyncedKeyRef.current = calendarKey;
        setSyncState('idle');
        setSyncError(null);
      } catch (error) {
        console.error('Failed to sync calendar notification token.', error);
        if (!canceled) {
          setSyncState('error');
          setSyncError('通知設定の同期に失敗しました。時間をおいて再試行してください。');
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [supported, permission, calendarKey, uid, fiscalYear, calendarId, syncState]);

  const subscribe = useCallback(async () => {
    if (!supported) {
      setRequestError('このブラウザではプッシュ通知を利用できません。');
      return false;
    }
    if (!calendarKey || !uid) {
      setRequestError('学事カレンダー設定とログイン状態を確認してください。');
      return false;
    }

    setIsRequesting(true);
    setRequestError(null);

    try {
      let nextPermission: NotificationPermissionState = permission;
      if (permission === 'default' && typeof Notification !== 'undefined') {
        nextPermission = await Notification.requestPermission();
        setPermission(nextPermission);
      }

      if (nextPermission !== 'granted') {
        setRequestError('通知が許可されませんでした。ブラウザの設定を確認してください。');
        return false;
      }

      const token = await getFcmToken(true);
      if (!token) {
        throw new Error('Failed to obtain FCM token.');
      }

      await syncCalendarNotificationToken({
        token,
        uid,
        fiscalYear,
        calendarId,
      });

      lastSyncedKeyRef.current = calendarKey;
      setSyncState('idle');
      setSyncError(null);
      return true;
    } catch (error) {
      console.error('Failed to subscribe calendar notification token.', error);
      setRequestError('通知の登録に失敗しました。時間をおいて再度お試しください。');
      return false;
    } finally {
      setIsRequesting(false);
    }
  }, [supported, calendarKey, uid, permission, fiscalYear, calendarId]);

  return useMemo(
    () => ({
      supported,
      permission,
      syncState,
      isRequesting,
      requestError,
      syncError,
      subscribe,
    }),
    [supported, permission, syncState, isRequesting, requestError, syncError, subscribe],
  );
}

export function CalendarNotificationManagerProvider({ children }: ProviderProps) {
  const value = useProvideCalendarNotificationManager();
  return (
    <CalendarNotificationManagerContext.Provider value={value}>
      {children}
    </CalendarNotificationManagerContext.Provider>
  );
}

export function useCalendarNotificationManager(): CalendarNotificationManagerValue {
  const context = useContext(CalendarNotificationManagerContext);
  if (!context) {
    throw new Error('useCalendarNotificationManager must be used within provider.');
  }
  return context;
}
