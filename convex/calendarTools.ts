import { internalMutation, internalQuery } from "./_generated/server";
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

const normalizeClassWeekday = (
  value: unknown,
  dateIso: string,
  fallback?: number
): number => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 7) {
    return Math.trunc(value);
  }
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback >= 1 && fallback <= 7) {
    return Math.trunc(fallback);
  }
  return deriveClassWeekday(dateIso);
};

const normalizeCreatorId = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveDownloadCount = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
};

// カレンダー作成ツール
export const createCalendar = internalMutation({
  args: {
    name: v.string(),
    fiscalYear: v.number(),
    universityCode: v.optional(v.string()),
    memo: v.optional(v.string()),
    inputInformation: v.optional(v.string()),
    creatorId: v.optional(v.string()),
  },
  returns: v.id("calendars"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const fiscalStart = `${args.fiscalYear}-04-01`;
    const fiscalEnd = `${args.fiscalYear + 1}-03-31`;
    const normalizedCreatorId = normalizeCreatorId(args.creatorId);

    const calendarId = await ctx.db.insert("calendars", {
      name: args.name,
      fiscalYear: args.fiscalYear,
      universityCode: args.universityCode,
      fiscalStart,
      fiscalEnd,
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      creatorId: normalizedCreatorId,
      isPublishable: false,
      memo: typeof args.memo === "string" ? args.memo.trim() : "",
      inputInformation: typeof args.inputInformation === "string" ? args.inputInformation.trim() : "",
    });
    
    return calendarId;
  },
});

// カレンダー情報取得ツール
export const getCalendarInfo = internalQuery({
  args: {
    calendarId: v.id("calendars"),
  },
  returns: v.object({
    calendar: v.object({
      _id: v.id("calendars"),
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
    dayCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const calendar = await ctx.db.get(args.calendarId);
    if (!calendar) {
      throw new Error("カレンダーが見つかりません");
    }
    
    const days = await ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) => q.eq("calendarId", args.calendarId))
      .collect();
    
    const {
      _id,
      name,
      fiscalYear,
      universityCode,
      fiscalStart,
      fiscalEnd,
      createdAt,
      updatedAt,
      isPublishable,
      memo,
      inputInformation,
    } = calendar;
    const downloadCount = resolveDownloadCount(calendar.downloadCount);
    const creatorId = normalizeCreatorId(calendar.creatorId);

    return {
      calendar: {
        _id,
        name,
        fiscalYear,
        universityCode,
        fiscalStart,
        fiscalEnd,
        createdAt,
        updatedAt,
        downloadCount,
        creatorId,
        isPublishable,
        memo,
        inputInformation,
      },
      dayCount: days.length,
    };
  },
});

// カレンダー日付更新ツール
export const updateCalendarDay = internalMutation({
  args: {
    calendarId: v.id("calendars"),
    date: v.string(), // YYYY-MM-DD
    type: v.union(
      v.literal("未指定"),
      v.literal("授業日"),
      v.literal("試験日"),
      v.literal("予備日"),
      v.literal("休講日")
    ),
    termId: v.optional(v.id("calendar_terms")),
    description: v.optional(v.string()),
    classWeekday: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) => 
        q.eq("calendarId", args.calendarId).eq("date", args.date)
      )
      .unique();
    
    const now = Date.now();
    const nextClassWeekday = normalizeClassWeekday(args.classWeekday, args.date, existing?.classWeekday);
    const dayData = {
      calendarId: args.calendarId,
      date: args.date,
      type: args.type,
      termId: args.termId,
      description: args.description,
      classWeekday: nextClassWeekday,
      updatedAt: now,
    };
    
    if (existing) {
      await ctx.db.patch(existing._id, dayData);
    } else {
      await ctx.db.insert("calendar_days", dayData);
    }
    
    return null;
  },
});

// カレンダー一覧取得ツール
export const listCalendars = internalQuery({
  args: {
    fiscalYear: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id("calendars"),
    name: v.string(),
    fiscalYear: v.number(),
    universityCode: v.optional(v.string()),
    createdAt: v.number(),
    isPublishable: v.optional(v.boolean()),
  })),
  handler: async (ctx, args) => {
    let calendars;
    
    if (args.fiscalYear !== undefined) {
      calendars = await ctx.db
        .query("calendars")
        .withIndex("by_year", (q) => q.eq("fiscalYear", args.fiscalYear!))
        .order("desc")
        .take(args.limit || 20);
    } else {
      calendars = await ctx.db
        .query("calendars")
        .order("desc")
        .take(args.limit || 20);
    }
    
    return calendars.map(cal => ({
      _id: cal._id,
      name: cal.name,
      fiscalYear: cal.fiscalYear,
      universityCode: cal.universityCode,
      createdAt: cal.createdAt,
      isPublishable: cal.isPublishable,
    }));
  },
});
