import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { holidayArrayValidator } from "./holidayTypes";

export const getHolidayCache = internalQuery({
  args: {
    fiscalYear: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("holiday_cache"),
      _creationTime: v.number(),
      fiscalYear: v.number(),
      holidays: holidayArrayValidator,
      fetchedAt: v.number(),
    })
  ),
  handler: async (ctx, { fiscalYear }) => {
    const result = await ctx.db
      .query("holiday_cache")
      .withIndex("by_year", (q) => q.eq("fiscalYear", fiscalYear))
      .unique();

    if (!result) {
      return null;
    }

    const { _id, _creationTime, fiscalYear: year, holidays, fetchedAt } = result;
    return {
      _id,
      _creationTime,
      fiscalYear: year,
      holidays,
      fetchedAt,
    };
  },
});

export const saveHolidayCache = internalMutation({
  args: {
    fiscalYear: v.number(),
    holidays: holidayArrayValidator,
    fetchedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("holiday_cache")
      .withIndex("by_year", (q) => q.eq("fiscalYear", args.fiscalYear))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        holidays: args.holidays,
        fetchedAt: args.fetchedAt,
      });
    } else {
      await ctx.db.insert("holiday_cache", {
        fiscalYear: args.fiscalYear,
        holidays: args.holidays,
        fetchedAt: args.fetchedAt,
      });
    }

    return null;
  },
});
