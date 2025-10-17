import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const setDaysBulk = mutation({
  args: {
    calendarId: v.id("calendars"),
    days: v.array(
      v.object({
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
        classWeekday: v.optional(v.number()), // 1..7
        isHoliday: v.optional(v.boolean()),
        nationalHolidayName: v.optional(v.string()),
        classOrder: v.optional(v.number()),
        notificationReasons: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { calendarId, days }) => {
    const now = Date.now();
    for (const d of days) {
      const existing = await ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_date", (q) => q.eq("calendarId", calendarId).eq("date", d.date))
        .unique();
      const manualWeekday =
        typeof d.classWeekday === "number" && Number.isFinite(d.classWeekday) && d.classWeekday >= 1 && d.classWeekday <= 7
          ? Math.trunc(d.classWeekday)
          : undefined;
      const payload = {
        ...d,
        termId: d.termId ?? undefined,
        description:
          typeof d.description === "string" && d.description.trim().length > 0
            ? d.description.trim()
            : undefined,
        classWeekday: manualWeekday,
        isHoliday: d.isHoliday ?? false,
        nationalHolidayName: d.nationalHolidayName ?? undefined,
        classOrder: d.classOrder ?? undefined,
        notificationReasons: typeof d.notificationReasons === "string" && d.notificationReasons.trim().length > 0
          ? d.notificationReasons.trim()
          : undefined,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("calendar_days", { calendarId, ...payload });
      }
    }
    return { updated: days.length };
  },
});
