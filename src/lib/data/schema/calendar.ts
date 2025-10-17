import { z } from 'zod';

/**
 * Firestore の calendar_terms ドキュメント構造。
 * `name` フィールドは UI 表示用の学期名称です。
 */
export const calendarTermSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'name は必須です'),
  shortName: z.string().optional(),
  order: z.number().optional(),
  classCount: z.number().optional(),
  isHoliday: z.boolean().optional(),
  updatedAt: z.unknown().optional(),
});

export type CalendarTerm = z.infer<typeof calendarTermSchema>;

/**
 * Firestore の calendar_days ドキュメント構造。
 * date は ISO 形式 (`YYYY-MM-DD`) を想定しています。
 */
export const calendarDaySchema = z.object({
  id: z.string(),
  date: z.string().optional(),
  type: z.string().optional(),
  classWeekday: z.number().optional(),
  termName: z.string().optional(),
  termShortName: z.string().optional(),
  classOrder: z.number().optional(),
  nationalHolidayName: z.string().optional(),
  notificationReasons: z
    .preprocess((value) => {
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === 'string') {
        return value.length > 0 ? [value] : [];
      }
      return undefined;
    }, z.array(z.string()).optional()),
  isDeleted: z.boolean().optional(),
  syncedAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export type CalendarDay = z.infer<typeof calendarDaySchema>;
