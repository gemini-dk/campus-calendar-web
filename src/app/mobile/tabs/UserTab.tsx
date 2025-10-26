'use client';

import UserMenuContent from '../components/UserMenuContent';
import { CalendarNotificationManagerProvider } from '../hooks/useCalendarNotificationManager';

export default function UserTab() {
  return (
    <CalendarNotificationManagerProvider>
      <UserMenuContent className="min-h-full" />
    </CalendarNotificationManagerProvider>
  );
}
