import type { MetadataRoute } from "next";

import { FISCAL_YEARS } from "@/lib/constants/fiscal-year";
import { listUniversities, listUniversityCalendars } from "@/lib/data/service/university.service";
import { buildUniversityCalendarYearUrl, getSiteOrigin } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin().replace(/\/$/, "");
  const universities = await listUniversities();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${origin}/`,
      priority: 1.0,
    },
  ];

  for (const university of universities) {
    for (const fiscalYear of FISCAL_YEARS) {
      const calendars = await listUniversityCalendars(university, fiscalYear);
      if (calendars.length === 0) {
        continue;
      }
      entries.push({
        url: buildUniversityCalendarYearUrl(university.webId, fiscalYear),
        priority: 0.8,
      });
    }
  }

  return entries;
}
