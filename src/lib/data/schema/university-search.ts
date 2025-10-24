import { z } from 'zod';

export const universitySearchEntrySchema = z.object({
  name: z.string().min(1, 'name は必須です'),
  furigana: z.string().min(1, 'furigana は必須です'),
  webId: z.string().min(1, 'webId は必須です'),
});

export const universitySearchResponseSchema = z.array(universitySearchEntrySchema);

export type UniversitySearchEntry = z.infer<typeof universitySearchEntrySchema>;
