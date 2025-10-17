import { query } from "./_generated/server";
import { v } from "convex/values";

export const getCalendarForMigration = query({
  args: { id: v.id("calendars") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const getCalendarDayForMigration = query({
  args: { id: v.id("calendar_days") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const getCalendarTermForMigration = query({
  args: { id: v.id("calendar_terms") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const getUniversityForMigration = query({
  args: { id: v.id("universities") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const getUniversityCampusForMigration = query({
  args: { id: v.id("university_campuses") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const getUniversityByCodeForMigration = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("universities")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
  },
});

export const getUniversityCampusesByCodeForMigration = query({
  args: { universityCode: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("university_campuses")
      .withIndex("by_university", (q) => q.eq("universityCode", args.universityCode))
      .collect();
  },
});

export const getCalendarsByUniversityForMigration = query({
  args: { universityCode: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("calendars")
      .withIndex("by_university_year", (q) => q.eq("universityCode", args.universityCode))
      .collect();
  },
});

export const getCalendarTermsByCalendarForMigration = query({
  args: { calendarId: v.id("calendars") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("calendar_terms")
      .withIndex("by_calendar", (q) => q.eq("calendarId", args.calendarId))
      .collect();
  },
});

export const getCalendarDaysByCalendarForMigration = query({
  args: { calendarId: v.id("calendars") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) => q.eq("calendarId", args.calendarId))
      .collect();
  },
});

export const listAllUniversitiesForMigration = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("universities").collect();
  },
});

export const listAllUniversityCampusesForMigration = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("university_campuses").collect();
  },
});
