export const PUBLIC_CALENDAR_TRANSFER_STORAGE_KEY =
  "campus-calendar:public-calendar-transfer";

export type PublicCalendarTransferPayload = {
  fiscalYear: string;
  calendarId: string;
  calendarName: string;
  universityName: string;
  webId: string;
  hasSaturdayClasses: boolean;
};
