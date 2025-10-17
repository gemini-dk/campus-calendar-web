import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const bulkUpsert = mutation({
  args: {
    rows: v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        prefecture: v.optional(v.string()),
        type: v.optional(v.union(v.literal("国立"), v.literal("公立"), v.literal("私立"))),
        capacity: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, { rows }) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      const existing = await ctx.db
        .query("universities")
        .withIndex("by_code", (q) => q.eq("code", r.code))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...r, updatedAt: now });
        updated++;
      } else {
        await ctx.db.insert("universities", { ...r, createdAt: now, updatedAt: now });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const bulkUpsertCampuses = mutation({
  args: {
    rows: v.array(
      v.object({
        universityCode: v.string(),
        campusName: v.string(),
        universityName: v.optional(v.string()),
        prefecture: v.optional(v.string()),
        city: v.optional(v.string()),
        postalCode: v.optional(v.string()),
        address: v.optional(v.string()),
        officeCode: v.optional(v.string()),
        officeName: v.optional(v.string()),
        class10Code: v.optional(v.string()),
        class10Name: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { rows }) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      const existing = await ctx.db
        .query("university_campuses")
        .withIndex("by_university_campus", (q) => q.eq("universityCode", r.universityCode).eq("campusName", r.campusName))
        .unique();
      if (existing) {
        const {
          officeCode: _officeCode,
          officeName: _officeName,
          class10Code: _class10Code,
          class10Name: _class10Name,
          ...patchable
        } = r;
        await ctx.db.patch(existing._id, { ...patchable, updatedAt: now });
        updated++;
      } else {
        await ctx.db.insert("university_campuses", { ...r, createdAt: now, updatedAt: now });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const searchByName = query({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { q, limit }) => {
    const l = Math.max(1, Math.min(limit ?? 20, 100));
    const res = await ctx.db
      .query("universities")
      .withIndex("by_name", (ix) => ix.gte("name", q))
      .take(l * 5); // ゆとりを持って前方一致候補取得
    // 前方一致ベース、足りなければ部分一致で補完
    const prefix = res.filter((r) => r.name.startsWith(q)).slice(0, l);
    if (prefix.length >= l)
      return prefix.map(({ code, name, prefecture, type, capacity, _id }) => ({
        _id,
        code,
        name,
        prefecture,
        type,
        capacity,
      }));
    const extra = res.filter((r) => !r.name.startsWith(q) && r.name.includes(q)).slice(0, l - prefix.length);
    const rows = prefix.concat(extra).slice(0, l);
    return rows.map(({ code, name, prefecture, type, capacity, _id }) => ({
      _id,
      code,
      name,
      prefecture,
      type,
      capacity,
    }));
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const row = await ctx.db
      .query("universities")
      .withIndex("by_code", (ix) => ix.eq("code", code))
      .unique();
    if (!row) return null;
    const { _id, name, prefecture, type } = row;
    const { capacity } = row;
    return { _id, code, name, prefecture, type, capacity };
  },
});

export const getById = query({
  args: { id: v.id("universities") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    const { code, name, prefecture, type, _id } = row;
    const { capacity } = row;
    return { _id, code, name, prefecture, type, capacity };
  },
});

export const getCampusById = query({
  args: { id: v.id("university_campuses") },
  handler: async (ctx, { id }) => {
    const campus = await ctx.db.get(id);
    if (!campus) return null;
    const {
      _id,
      universityCode,
      campusName,
      universityName,
      prefecture,
      city,
      postalCode,
      address,
      officeCode,
      officeName,
      class10Code,
      class10Name,
      updatedAt,
    } = campus;
    return {
      _id,
      universityCode,
      campusName,
      universityName,
      prefecture,
      city,
      postalCode,
      address,
      officeCode,
      officeName,
      class10Code,
      class10Name,
      updatedAt,
    };
  },
});

export const updateCampusCodes = mutation({
  args: {
    campusId: v.id("university_campuses"),
    officeCode: v.optional(v.string()),
    officeName: v.optional(v.string()),
    class10Code: v.optional(v.string()),
    class10Name: v.optional(v.string()),
  },
  handler: async (ctx, { campusId, officeCode, officeName, class10Code, class10Name }) => {
    const existing = await ctx.db.get(campusId);
    if (!existing) {
      throw new Error("キャンパスが見つかりません");
    }
    const patch: Partial<typeof existing> = {
      updatedAt: Date.now(),
    };
    if (officeCode !== undefined) patch.officeCode = officeCode;
    if (officeName !== undefined) patch.officeName = officeName;
    if (class10Code !== undefined) patch.class10Code = class10Code;
    if (class10Name !== undefined) patch.class10Name = class10Name;
    await ctx.db.patch(campusId, patch);
    const next = await ctx.db.get(campusId);
    if (!next) return null;
    const {
      _id,
      universityCode,
      campusName,
      universityName,
      prefecture,
      city,
      postalCode,
      address,
      officeCode: nextOfficeCode,
      officeName: nextOfficeName,
      class10Code: nextClass10Code,
      class10Name: nextClass10Name,
      updatedAt,
    } = next;
    return {
      _id,
      universityCode,
      campusName,
      universityName,
      prefecture,
      city,
      postalCode,
      address,
      officeCode: nextOfficeCode,
      officeName: nextOfficeName,
      class10Code: nextClass10Code,
      class10Name: nextClass10Name,
      updatedAt,
    };
  },
});

export const listCampusesByUniversityCodes = query({
  args: { codes: v.array(v.string()) },
  handler: async (ctx, { codes }) => {
    const uniqueCodes = Array.from(
      new Set(
        codes
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
      )
    );
    const results = [] as Array<{
      universityCode: string;
      campuses: Array<{
        _id: string;
        campusName: string;
        universityName?: string;
        prefecture?: string;
        city?: string;
        postalCode?: string;
        address?: string;
        officeCode?: string;
        officeName?: string;
        class10Code?: string;
        class10Name?: string;
      }>;
    }>;

    for (const code of uniqueCodes) {
      const campuses = await ctx.db
        .query("university_campuses")
        .withIndex("by_university", (q) => q.eq("universityCode", code))
        .collect();
      results.push({
        universityCode: code,
        campuses: campuses.map(
          ({
            _id,
            campusName,
            universityName,
            prefecture,
            city,
            postalCode,
            address,
            officeCode,
            officeName,
            class10Code,
            class10Name,
          }) => ({
            _id: _id as string,
            campusName,
            universityName,
            prefecture,
            city,
            postalCode,
            address,
            officeCode,
            officeName,
            class10Code,
            class10Name,
          })
        ),
      });
    }

    return results;
  },
});

export const listCampusesByUniversityCode = query({
  args: { universityCode: v.string() },
  handler: async (ctx, { universityCode }) => {
    return await ctx.db
      .query("university_campuses")
      .withIndex("by_university", (q) => q.eq("universityCode", universityCode))
      .collect();
  },
});
