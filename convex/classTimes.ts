import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createClassTimeSet = mutation({
  args: {
    name: v.string(),
    universityCode: v.optional(v.string()),
  },
  handler: async (ctx, { name, universityCode }) => {
    const now = Date.now();
    const id = await ctx.db.insert("class_time_sets", {
      name,
      universityCode,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const updateClassTimeSet = mutation({
  args: {
    classTimeSetId: v.id("class_time_sets"),
    name: v.string(),
    universityCode: v.optional(v.string()),
  },
  handler: async (ctx, { classTimeSetId, name, universityCode }) => {
    const set = await ctx.db.get(classTimeSetId);
    if (!set) throw new Error("Class time set not found");
    await ctx.db.patch(classTimeSetId, {
      name,
      universityCode,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const deleteClassTimeSet = mutation({
  args: { classTimeSetId: v.id("class_time_sets") },
  handler: async (ctx, { classTimeSetId }) => {
    const set = await ctx.db.get(classTimeSetId);
    if (!set) return false;
    const existing = await ctx.db
      .query("class_time_periods")
      .withIndex("by_set", (q) => q.eq("classTimeSetId", classTimeSetId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(classTimeSetId);
    return true;
  },
});

export const listClassTimeSetsByUniversity = query({
  args: { universityCode: v.string() },
  handler: async (ctx, { universityCode }) => {
    const rows = await ctx.db
      .query("class_time_sets")
      .withIndex("by_university", (q) => q.eq("universityCode", universityCode))
      .collect();
    rows.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0));
    return rows;
  },
});

export const getClassTimeSet = query({
  args: { classTimeSetId: v.id("class_time_sets") },
  handler: async (ctx, { classTimeSetId }) => {
    const set = await ctx.db.get(classTimeSetId);
    if (!set) return null;
    const periods = await ctx.db
      .query("class_time_periods")
      .withIndex("by_set", (q) => q.eq("classTimeSetId", classTimeSetId))
      .collect();
    periods.sort((a, b) => a.period - b.period);
    return { set, periods };
  },
});

export const setPeriodsBulk = mutation({
  args: {
    classTimeSetId: v.id("class_time_sets"),
    periods: v.array(
      v.object({
        period: v.number(),
        start: v.string(),
        end: v.string(),
      })
    ),
  },
  handler: async (ctx, { classTimeSetId, periods }) => {
    const set = await ctx.db.get(classTimeSetId);
    if (!set) throw new Error("Class time set not found");
    const existing = await ctx.db
      .query("class_time_periods")
      .withIndex("by_set", (q) => q.eq("classTimeSetId", classTimeSetId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    const now = Date.now();
    const sorted = [...periods].sort((a, b) => a.period - b.period);
    for (const p of sorted) {
      await ctx.db.insert("class_time_periods", {
        classTimeSetId,
        period: p.period,
        start: p.start,
        end: p.end,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(classTimeSetId, { updatedAt: Date.now() });
    return { updated: sorted.length };
  },
});

export const searchClassTimeSets = query({
  args: {
    q: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { q, limit }) => {
    const keyword = (q ?? "").trim();
    const limitValue = Math.max(1, Math.min(limit ?? 100, 200));

    let allowedCodes: Set<string> | null = null;
    if (keyword) {
      const universityCandidates = await ctx.db
        .query("universities")
        .withIndex("by_name", (ix) => ix.gte("name", keyword))
        .take(limitValue * 5);
      const prefixMatches = universityCandidates.filter((u) => u.name.startsWith(keyword));
      const partialMatches = universityCandidates.filter((u) => !u.name.startsWith(keyword) && u.name.includes(keyword));
      const matches = prefixMatches.concat(partialMatches).slice(0, limitValue * 3);
      const codes = matches
        .map((u) => u.code)
        .filter((code): code is string => typeof code === "string" && code.trim().length > 0);
      allowedCodes = new Set(codes);
      if (allowedCodes.size === 0) {
        return [];
      }
    }

    const sets = await ctx.db.query("class_time_sets").collect();
    sets.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0));

    const filteredSets = allowedCodes
      ? sets.filter((set) => set.universityCode && allowedCodes?.has(set.universityCode))
      : sets;

    const limitedSets = filteredSets.slice(0, limitValue);

    const codesToFetch = new Set(
      limitedSets
        .map((set) => set.universityCode)
        .filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    );

    const universityNameByCode = new Map<string, string>();
    for (const code of codesToFetch) {
      const uni = await ctx.db
        .query("universities")
        .withIndex("by_code", (ix) => ix.eq("code", code))
        .unique();
      if (uni) {
        universityNameByCode.set(code, uni.name);
      }
    }

    return limitedSets.map((set) => ({
      _id: set._id,
      name: set.name,
      universityCode: set.universityCode,
      universityName: set.universityCode ? universityNameByCode.get(set.universityCode) ?? "" : "",
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
    }));
  },
});
