import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const sortLocaleInsensitive = (a: string, b: string) => a.localeCompare(b, 'ja');

const toOrderValue = (order?: number) =>
  typeof order === 'number' && Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;

const normalizeName = (name: string) => name.trim();

type ListedTerm = {
  _id: Id<"calendar_terms">;
  name: string;
  order?: number;
  shortName?: string;
  classCount?: number;
  holidayFlag?: 1 | 2;
};

const normalizeHolidayFlag = (value: unknown): 1 | 2 | undefined => {
  if (typeof value !== 'number') {
    return undefined;
  }
  if (value === 1) {
    return 1;
  }
  if (value === 2) {
    return 2;
  }
  if (value === 0) {
    return 2;
  }
  return undefined;
};

export const listTerms = query({
  args: {
    calendarId: v.id("calendars"),
  },
  returns: v.array(
    v.object({
      _id: v.id("calendar_terms"),
      name: v.string(),
      order: v.optional(v.number()),
      shortName: v.optional(v.string()),
      classCount: v.optional(v.number()),
      holidayFlag: v.optional(v.number()),
    })
  ),
  handler: async (ctx, { calendarId }) => {
    const terms = await ctx.db
      .query("calendar_terms")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    const sanitized: ListedTerm[] = [];
    for (const term of terms) {
      const trimmedName = term.name.trim();
      if (trimmedName.length === 0) {
        continue;
      }

      const trimmedShortName = term.shortName?.trim();

      const orderValue = typeof term.order === 'number' && Number.isFinite(term.order)
        ? term.order
        : undefined;
      const classCountValue = typeof term.classCount === 'number' && Number.isFinite(term.classCount)
        ? term.classCount
        : undefined;

      const entry: ListedTerm = {
        _id: term._id,
        name: trimmedName,
      };

      if (orderValue !== undefined) {
        entry.order = orderValue;
      }
      if (trimmedShortName && trimmedShortName.length > 0) {
        entry.shortName = trimmedShortName;
      }
      if (classCountValue !== undefined) {
        entry.classCount = classCountValue;
      }

      const holidayFlagValue = normalizeHolidayFlag(term.holidayFlag);
      if (holidayFlagValue !== undefined) {
        entry.holidayFlag = holidayFlagValue;
      }

      sanitized.push(entry);
    }

    return sanitized.sort((a, b) => {
      const orderDiff = toOrderValue(a.order) - toOrderValue(b.order);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return sortLocaleInsensitive(a.name, b.name);
    });
  },
});

export const addTerm = mutation({
  args: {
    calendarId: v.id("calendars"),
    termName: v.string(),
  },
  returns: v.object({
    added: v.boolean(),
    term: v.object({
      _id: v.id("calendar_terms"),
      name: v.string(),
      order: v.optional(v.number()),
      shortName: v.optional(v.string()),
      classCount: v.optional(v.number()),
      holidayFlag: v.optional(v.number()),
    }),
  }),
  handler: async (ctx, { calendarId, termName }) => {
    const normalized = normalizeName(termName);
    if (normalized.length === 0) {
      throw new Error("期間名を入力してください。");
    }

    const existingTerms = await ctx.db
      .query("calendar_terms")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    const existing = existingTerms.find((term) => normalizeName(term.name) === normalized);

    if (existing) {
      let updatedRecord = existing;
      if (existing.name !== normalized) {
        await ctx.db.patch(existing._id, {
          name: normalized,
          updatedAt: Date.now(),
        });
        updatedRecord = { ...existing, name: normalized };
      }

      const sanitized: ListedTerm = {
        _id: updatedRecord._id,
        name: normalized,
      };

      const orderValue = typeof updatedRecord.order === 'number' && Number.isFinite(updatedRecord.order)
        ? updatedRecord.order
        : undefined;
      if (orderValue !== undefined) {
        sanitized.order = orderValue;
      }

      const shortName = updatedRecord.shortName?.trim();
      if (shortName) {
        sanitized.shortName = shortName;
      }

      const classCountValue = typeof updatedRecord.classCount === 'number' && Number.isFinite(updatedRecord.classCount)
        ? updatedRecord.classCount
        : undefined;
      if (classCountValue !== undefined) {
        sanitized.classCount = classCountValue;
      }

      const holidayFlagValue = normalizeHolidayFlag(updatedRecord.holidayFlag);
      if (holidayFlagValue !== undefined) {
        sanitized.holidayFlag = holidayFlagValue;
      }

      return { added: false, term: sanitized };
    }

    const maxOrder = existingTerms.reduce((currentMax, term) => {
      return typeof term.order === 'number' && Number.isFinite(term.order)
        ? Math.max(currentMax, term.order)
        : currentMax;
    }, 0);

    const nextOrder = maxOrder + 1;
    const insertedId = await ctx.db.insert("calendar_terms", {
      calendarId,
      name: normalized,
      order: nextOrder,
      holidayFlag: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      added: true,
      term: {
        _id: insertedId,
        name: normalized,
        order: nextOrder,
        holidayFlag: 2,
      },
    };
  },
});

export const removeTerm = mutation({
  args: {
    calendarId: v.id("calendars"),
    termId: v.id("calendar_terms"),
  },
  returns: v.boolean(),
  handler: async (ctx, { calendarId, termId }) => {
    const existing = await ctx.db.get(termId);
    if (!existing || existing.calendarId !== calendarId) {
      return false;
    }

    await ctx.db.delete(termId);
    return true;
  },
});

export const upsertMany = mutation({
  args: {
    calendarId: v.id("calendars"),
    termNames: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, { calendarId, termNames }) => {
    const existingTerms = await ctx.db
      .query("calendar_terms")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    const existingByName = new Map<string, { id: Id<"calendar_terms"> | null; name: string }>();
    existingTerms.forEach((term) => {
      existingByName.set(normalizeName(term.name), { id: term._id, name: term.name });
    });

    let nextOrder = existingTerms.reduce((currentMax, term) => {
      return typeof term.order === 'number' && Number.isFinite(term.order)
        ? Math.max(currentMax, term.order)
        : currentMax;
    }, 0) + 1;

    let addedCount = 0;
    for (const rawName of termNames) {
      const normalized = normalizeName(rawName);
      if (normalized.length === 0) continue;

      const existing = existingByName.get(normalized);

      if (existing) {
        if (existing.name !== normalized && existing.id) {
          await ctx.db.patch(existing.id, {
            name: normalized,
            updatedAt: Date.now(),
          });
          existingByName.set(normalized, { id: existing.id, name: normalized });
        }
        continue;
      }

      const insertedId = await ctx.db.insert("calendar_terms", {
        calendarId,
        name: normalized,
        order: nextOrder,
        holidayFlag: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      existingByName.set(normalized, { id: insertedId, name: normalized });
      nextOrder += 1;
      addedCount += 1;
    }

    return addedCount;
  },
});

export const updateTerm = mutation({
  args: {
    calendarId: v.id("calendars"),
    termId: v.id("calendar_terms"),
    patch: v.object({
      name: v.optional(v.string()),
      order: v.optional(v.union(v.number(), v.null())),
      shortName: v.optional(v.union(v.string(), v.null())),
      classCount: v.optional(v.union(v.number(), v.null())),
      holidayFlag: v.optional(v.union(v.number(), v.null())),
    }),
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, { calendarId, termId, patch }) => {
    const term = await ctx.db.get(termId);
    if (!term) {
      throw new Error("期間が見つかりませんでした。");
    }

    if (term.calendarId !== calendarId) {
      throw new Error("別のカレンダーの期間は編集できません。");
    }

    const updates: Partial<typeof term> = {};

    if (patch.name !== undefined) {
      const normalized = normalizeName(patch.name);
      if (normalized.length === 0) {
        throw new Error("期間名を入力してください。");
      }

      if (normalized !== term.name) {
        const duplicate = await ctx.db
          .query("calendar_terms")
          .withIndex("by_calendar_name", (q) =>
            q.eq("calendarId", calendarId).eq("name", normalized)
          )
          .unique();

        if (duplicate && duplicate._id !== termId) {
          throw new Error("同じ名称の期間が既に存在します。");
        }

        updates.name = normalized;
      }
    }

    if (patch.order !== undefined) {
      if (patch.order === null) {
        updates.order = undefined;
      } else {
        if (!Number.isFinite(patch.order)) {
          throw new Error("順序には数値を入力してください。");
        }
        const orderValue = Math.trunc(patch.order);
        if (orderValue < 0) {
          throw new Error("順序には0以上の数値を入力してください。");
        }
        updates.order = orderValue;
      }
    }

    if (patch.shortName !== undefined) {
      const trimmed = patch.shortName === null ? null : patch.shortName.trim();
      updates.shortName = trimmed && trimmed.length > 0 ? trimmed : undefined;
    }

    if (patch.classCount !== undefined) {
      if (patch.classCount === null) {
        updates.classCount = undefined;
      } else {
        if (!Number.isFinite(patch.classCount) || patch.classCount < 0) {
          throw new Error("授業回数には0以上の数値を入力してください。");
        }
        const classCountValue = Math.trunc(patch.classCount);
        if (classCountValue < 0) {
          throw new Error("授業回数には0以上の数値を入力してください。");
        }
        updates.classCount = classCountValue;
      }
    }

    if (patch.holidayFlag !== undefined) {
      if (patch.holidayFlag === null) {
        updates.holidayFlag = undefined;
      } else {
        if (!Number.isFinite(patch.holidayFlag)) {
          throw new Error("休暇フラグには1または2を入力してください。");
        }
        const normalizedFlag = normalizeHolidayFlag(patch.holidayFlag);
        if (normalizedFlag === undefined) {
          throw new Error("休暇フラグには1または2を入力してください。");
        }
        updates.holidayFlag = normalizedFlag;
      }
    }

    if (Object.keys(updates).length === 0) {
      return { updated: false };
    }

    await ctx.db.patch(termId, {
      ...updates,
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

export const upsertPresetTerms = mutation({
  args: {
    calendarId: v.id("calendars"),
    terms: v.array(
      v.object({
        name: v.string(),
        shortName: v.optional(v.string()),
        holidayFlag: v.optional(v.number()),
      })
    ),
  },
  returns: v.object({ added: v.number(), updated: v.number() }),
  handler: async (ctx, { calendarId, terms }) => {
    const existingTerms = await ctx.db
      .query("calendar_terms")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    const existingByName = new Map<string, typeof existingTerms[number]>();
    for (const term of existingTerms) {
      existingByName.set(normalizeName(term.name), term);
    }

    let nextOrder = existingTerms.reduce((currentMax, term) => {
      return typeof term.order === 'number' && Number.isFinite(term.order)
        ? Math.max(currentMax, term.order)
        : currentMax;
    }, 0) + 1;

    let added = 0;
    let updated = 0;
    const now = Date.now();

    for (const term of terms) {
      const normalizedName = normalizeName(term.name);
      if (normalizedName.length === 0) {
        continue;
      }

      const trimmedShortName = term.shortName?.trim();
      const effectiveShortName = trimmedShortName && trimmedShortName.length > 0
        ? trimmedShortName
        : undefined;
      const normalizedHolidayFlag = normalizeHolidayFlag(term.holidayFlag);

      const existing = existingByName.get(normalizedName);

      if (existing) {
        const patches: Partial<typeof existing> = {};
        if (existing.name !== normalizedName) {
          patches.name = normalizedName;
        }

        const storedShortName = existing.shortName?.trim() || undefined;
        if (storedShortName !== effectiveShortName) {
          patches.shortName = effectiveShortName;
        }

        const storedHolidayFlag = normalizeHolidayFlag(existing.holidayFlag);
        if (storedHolidayFlag !== normalizedHolidayFlag) {
          patches.holidayFlag = normalizedHolidayFlag;
        }

        if (Object.keys(patches).length > 0) {
          await ctx.db.patch(existing._id, {
            ...patches,
            updatedAt: now,
          });
          updated += 1;
        }
        continue;
      }

      await ctx.db.insert("calendar_terms", {
        calendarId,
        name: normalizedName,
        shortName: effectiveShortName,
        order: nextOrder,
        holidayFlag: normalizedHolidayFlag ?? 2,
        createdAt: now,
        updatedAt: now,
      });
      nextOrder += 1;
      added += 1;
    }

    return { added, updated };
  },
});
