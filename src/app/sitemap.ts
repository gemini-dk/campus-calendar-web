import type { MetadataRoute } from "next";

import { FISCAL_YEARS } from "@/lib/constants/fiscal-year";
import {
  listPublishableCalendarsByFiscalYear,
  listUniversities,
} from "@/lib/data/service/university.service";
import { buildUniversityCalendarYearUrl, getSiteOrigin } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin().replace(/\/$/, "");
  const universities = await listUniversities();

  const universityById = new Map(universities.map((university) => [university.id, university]));
  const universityByCode = new Map(
    universities
      .map((university) => {
        const code = typeof university.code === "string" ? university.code.trim() : "";
        return code ? ([code, university] as const) : null;
      })
      .filter((item): item is readonly [string, (typeof universities)[number]] => item !== null),
  );

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${origin}/`,
      priority: 1.0,
    },
  ];

  await Promise.all(
    FISCAL_YEARS.map(async (fiscalYear) => {
      const calendars = await listPublishableCalendarsByFiscalYear(fiscalYear);
      const handledUniversityIds = new Set<string>();

      for (const calendar of calendars) {
        const calendarRecord = calendar as UniversityCalendarWithUniversityInfo;
        const university =
          (calendarRecord.universityId && universityById.get(calendarRecord.universityId))
          || (calendarRecord.universityCode && universityByCode.get(calendarRecord.universityCode.trim()))
          || null;

        if (!university || handledUniversityIds.has(university.id)) {
          continue;
        }

        handledUniversityIds.add(university.id);
        entries.push({
          url: buildUniversityCalendarYearUrl(university.webId, fiscalYear),
          priority: 0.8,
        });
      }
    }),
  );

  return entries;
}

type UniversityCalendarWithUniversityInfo = {
  universityCode?: string;
  universityId?: string;
} & (
  | ReturnType<typeof listPublishableCalendarsByFiscalYear> extends Promise<(infer Item)[]>
      ? Item
      : never
);
