import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const sanitizeText = (value: string | undefined | null): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeMultilineUrls = (value: string | undefined | null): string | undefined => {
  if (typeof value !== "string") return undefined;
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return undefined;
  return lines.join("\n");
};

const toRecordDto = (row: {
  _id: Id<"university_research_records">;
  universityId: Id<"universities">;
  universityCode: string;
  universityName: string;
  fiscalYear: number;
  termScheme?: string;
  termSchemeSources?: string;
  classTimeAndCount?: string;
  classTimeAndCountSources?: string;
  academicCalendarLinks?: string;
  academicCalendarLinksSources?: string;
  informationSources?: string;
  finalOutput?: string;
  createdAt: number;
  updatedAt: number;
}) => ({
  _id: row._id,
  universityId: row.universityId,
  universityCode: row.universityCode,
  universityName: row.universityName,
  fiscalYear: row.fiscalYear,
  termScheme: row.termScheme ?? null,
  termSchemeSources: row.termSchemeSources ?? null,
  classTimeAndCount: row.classTimeAndCount ?? null,
  classTimeAndCountSources: row.classTimeAndCountSources ?? null,
  academicCalendarLinks: row.academicCalendarLinks ?? null,
  academicCalendarLinksSources: row.academicCalendarLinksSources ?? null,
  informationSources: row.informationSources ?? null,
  finalOutput: row.finalOutput ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const getByUniversityYear = query({
  args: {
    universityId: v.id("universities"),
    fiscalYear: v.number(),
  },
  handler: async (ctx, { universityId, fiscalYear }) => {
    const row = await ctx.db
      .query("university_research_records")
      .withIndex("by_university_year", (q) =>
        q.eq("universityId", universityId).eq("fiscalYear", fiscalYear)
      )
      .unique();

    if (!row) return null;
    return toRecordDto(row);
  },
});

export const listByUniversity = query({
  args: {
    universityId: v.id("universities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { universityId, limit }) => {
    const take = Math.max(1, Math.min(limit ?? 10, 50));
    const rows = await ctx.db
      .query("university_research_records")
      .withIndex("by_university_year", (q) => q.eq("universityId", universityId))
      .collect();

    return rows
      .sort((a, b) => b.fiscalYear - a.fiscalYear || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, take)
      .map(toRecordDto);
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const take = Math.max(1, Math.min(limit ?? 50, 200));
    const rows = await ctx.db.query("university_research_records").collect();
    return rows
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, take)
      .map(toRecordDto);
  },
});

export const upsert = mutation({
  args: {
    universityId: v.id("universities"),
    fiscalYear: v.number(),
    termScheme: v.optional(v.string()),
    termSchemeSources: v.optional(v.string()),
    classTimeAndCount: v.optional(v.string()),
    classTimeAndCountSources: v.optional(v.string()),
    academicCalendarLinks: v.optional(v.string()),
    academicCalendarLinksSources: v.optional(v.string()),
    informationSources: v.optional(v.string()),
    finalOutput: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      universityId,
      fiscalYear,
      termScheme,
      termSchemeSources,
      classTimeAndCount,
      classTimeAndCountSources,
      academicCalendarLinks,
      academicCalendarLinksSources,
      informationSources,
      finalOutput,
    },
  ) => {
    const university = await ctx.db.get(universityId);
    if (!university) {
      throw new Error("指定された大学が見つかりませんでした");
    }

    const now = Date.now();
    const sanitizedTermScheme = sanitizeText(termScheme);
    const sanitizedTermSchemeSources = sanitizeMultilineUrls(termSchemeSources);
    const sanitizedClassTimeAndCount = sanitizeText(classTimeAndCount);
    const sanitizedClassTimeAndCountSources = sanitizeMultilineUrls(classTimeAndCountSources);
    const sanitizedAcademicCalendarLinks = sanitizeMultilineUrls(academicCalendarLinks);
    const sanitizedAcademicCalendarLinksSources = sanitizeMultilineUrls(academicCalendarLinksSources);
    const sanitizedInformationSources = sanitizeMultilineUrls(informationSources);
    const sanitizedFinalOutput = sanitizeText(finalOutput);

    const existing = await ctx.db
      .query("university_research_records")
      .withIndex("by_university_year", (q) =>
        q.eq("universityId", universityId).eq("fiscalYear", fiscalYear)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        fiscalYear,
        termScheme: sanitizedTermScheme,
        termSchemeSources: sanitizedTermSchemeSources,
        classTimeAndCount: sanitizedClassTimeAndCount,
        classTimeAndCountSources: sanitizedClassTimeAndCountSources,
        academicCalendarLinks: sanitizedAcademicCalendarLinks,
        academicCalendarLinksSources: sanitizedAcademicCalendarLinksSources,
        informationSources: sanitizedInformationSources,
        finalOutput: sanitizedFinalOutput,
        universityCode: university.code,
        universityName: university.name,
        updatedAt: now,
      });
      return { status: "updated" as const, id: existing._id };
    }

    const insertedId = await ctx.db.insert("university_research_records", {
      universityId,
      universityCode: university.code,
      universityName: university.name,
      fiscalYear,
      termScheme: sanitizedTermScheme,
      termSchemeSources: sanitizedTermSchemeSources,
      classTimeAndCount: sanitizedClassTimeAndCount,
      classTimeAndCountSources: sanitizedClassTimeAndCountSources,
      academicCalendarLinks: sanitizedAcademicCalendarLinks,
      academicCalendarLinksSources: sanitizedAcademicCalendarLinksSources,
      informationSources: sanitizedInformationSources,
      finalOutput: sanitizedFinalOutput,
      createdAt: now,
      updatedAt: now,
    });

    return { status: "inserted" as const, id: insertedId };
  },
});
