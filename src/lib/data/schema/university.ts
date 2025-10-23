import { z } from 'zod';

export const universitySchema = z
  .object({
    id: z.string(),
    name: z.string().min(1, 'name は必須です'),
    webId: z.string().min(1, 'webId は必須です'),
    code: z.string().min(1, 'code は必須です').optional(),
    capacity: z.number().int().nonnegative().optional(),
    homepageUrl: z.string().url().optional(),
    shortName: z.string().optional(),
    prefecture: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export type University = z.infer<typeof universitySchema>;

export const universityCalendarSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1, 'name は必須です'),
    calendarId: z.string().min(1, 'calendarId は必須です'),
    fiscalYear: z.string().min(1, 'fiscalYear は必須です'),
    hasSaturdayClasses: z.boolean().optional(),
    order: z.number().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type UniversityCalendar = z.infer<typeof universityCalendarSchema>;
