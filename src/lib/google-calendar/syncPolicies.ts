export const GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function isSyncIntervalElapsed(lastSyncedAt: number | null | undefined, now = Date.now()): boolean {
  if (!lastSyncedAt) {
    return true;
  }
  return now - lastSyncedAt >= GOOGLE_CALENDAR_SYNC_MIN_INTERVAL_MS;
}
