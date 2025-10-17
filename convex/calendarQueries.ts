import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

const toMondayBasedWeekday = (jsWeekday: number) => (jsWeekday === 0 ? 7 : jsWeekday);

const deriveClassWeekday = (dateIso: string): number => {
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(timestamp)) {
    return 1;
  }
  const jsDate = new Date(timestamp);
  return toMondayBasedWeekday(jsDate.getUTCDay());
};

const normalizeClassWeekday = (value: unknown, dateIso: string): number => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 7) {
    return Math.trunc(value);
  }
  return deriveClassWeekday(dateIso);
};

const resolveDownloadCount = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
};

const normalizeCreatorId = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

// 大学コードと年度からカレンダーを取得（既存のlistCalendarsのinternal版）
export const getCalendarsByUniversityAndYear = internalQuery({
  args: {
    universityCode: v.string(),
    fiscalYear: v.number(),
  },
  returns: v.array(v.object({
    _id: v.id("calendars"),
    _creationTime: v.number(),
    name: v.string(),
    fiscalYear: v.number(),
    universityCode: v.optional(v.string()),
    fiscalStart: v.string(),
    fiscalEnd: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    downloadCount: v.number(),
    creatorId: v.optional(v.string()),
    isPublishable: v.optional(v.boolean()),
    memo: v.optional(v.string()),
    inputInformation: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const calendars = await ctx.db
      .query("calendars")
      .withIndex("by_university_year", (q) => 
        q.eq("universityCode", args.universityCode)
         .eq("fiscalYear", args.fiscalYear)
      )
      .collect();

    return calendars
      .filter((calendar) => calendar.isPublishable === true)
      .map((calendar) => ({
        ...calendar,
        downloadCount: resolveDownloadCount(calendar.downloadCount),
        creatorId: normalizeCreatorId(calendar.creatorId),
      }));
  },
});

// カレンダーIDから全日付情報を取得（既存のgetCalendarのinternal版）
export const getCalendarWithAllDays = internalQuery({
  args: {
    calendarId: v.id("calendars"),
  },
  returns: v.union(
    v.null(),
    v.object({
      calendar: v.object({
        _id: v.id("calendars"),
        _creationTime: v.number(),
        name: v.string(),
        fiscalYear: v.number(),
        universityCode: v.optional(v.string()),
      fiscalStart: v.string(),
      fiscalEnd: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      downloadCount: v.number(),
      creatorId: v.optional(v.string()),
      isPublishable: v.optional(v.boolean()),
      memo: v.optional(v.string()),
      inputInformation: v.optional(v.string()),
    }),
      days: v.array(v.object({
        _id: v.id("calendar_days"),
        _creationTime: v.number(),
        calendarId: v.id("calendars"),
        date: v.string(),
        type: v.union(
          v.literal("未指定"),
          v.literal("授業日"),
          v.literal("試験日"),
          v.literal("予備日"),
          v.literal("休講日")
        ),
        termId: v.optional(v.id("calendar_terms")),
        termName: v.optional(v.string()),
        description: v.optional(v.string()),
        isHoliday: v.optional(v.boolean()),
        nationalHolidayName: v.optional(v.string()),
        classWeekday: v.optional(v.number()),
        classOrder: v.optional(v.number()),
        notificationReasons: v.optional(v.string()),
        updatedAt: v.number(),
      })),
    })
  ),
  handler: async (ctx, args) => {
    const calendar = await ctx.db.get(args.calendarId);
    if (!calendar) return null;
    
    const [days, terms] = await Promise.all([
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_date", (q) => q.eq("calendarId", args.calendarId))
        .collect(),
      ctx.db
        .query("calendar_terms")
        .withIndex("by_calendar", (q) => q.eq("calendarId", args.calendarId))
        .collect(),
    ]);

    const termNameMap = new Map<string, string>();
    for (const term of terms) {
      const trimmed = term.name?.trim();
      if (trimmed) {
        termNameMap.set(term._id, trimmed);
      }
    }

    const hydrated = days.map((day) => ({
      ...day,
      termId: day.termId ?? undefined,
      termName: day.termId ? termNameMap.get(day.termId) : undefined,
      classWeekday: normalizeClassWeekday(day.classWeekday, day.date),
    }));

    const normalizedCalendar = {
      ...calendar,
      downloadCount: resolveDownloadCount(calendar.downloadCount),
      creatorId: normalizeCreatorId(calendar.creatorId),
    };

    return { calendar: normalizedCalendar, days: hydrated };
  },
});
