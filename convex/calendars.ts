import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { HolidayEntry, HolidayCacheRecord } from "./holidayTypes";

type FiscalHolidayActionResult = {
  holidays: HolidayEntry[];
  fromCache: boolean;
  fetchedAt: number;
};

type InitializeCalendarDaysResult = {
  initialized: boolean;
  daysInserted: number;
  fromCache: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function enumerateFiscalDates(fiscalYear: number): string[] {
  const startMs = Date.UTC(fiscalYear, 3, 1); // April = month index 3
  const endMs = Date.UTC(fiscalYear + 1, 2, 31); // March = month index 2
  const dates: string[] = [];

  for (let ms = startMs; ms <= endMs; ms += MS_PER_DAY) {
    const iso = new Date(ms).toISOString();
    dates.push(iso.slice(0, 10));
  }

  return dates;
}

function buildHolidayMap(entries: HolidayEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    map.set(entry.date, entry.name);
  }
  return map;
}

function sanitizeTermName(name?: string) {
  return name ? name.trim() : "";
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveDownloadCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
}

function normalizeCreatorId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function deriveCalendarWeekday(dateIso: string): number {
  const [year, month, day] = dateIso.split("-").map((segment) => Number(segment));
  if ([year, month, day].some((value) => !Number.isFinite(value))) {
    return 1;
  }
  const utcDate = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  const jsDay = utcDate.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

type NormalizedTerm = {
  _id: Id<"calendar_terms">;
  termName: string;
  order: number | undefined;
  shortName: string | undefined;
  classCount: number | undefined;
  holidayFlag: boolean | undefined;
};

type CalendarDetailPayload = {
  calendar: Doc<"calendars">;
  days: Doc<"calendar_days">[];
  terms: NormalizedTerm[];
  campuses: Array<{
    campusName: string;
    officeCode?: string;
    officeName?: string;
    class10Code?: string;
    class10Name?: string;
  }>;
};

type TermSummaryRecord = {
  termId?: Id<"calendar_terms">;
  termName: string;
  weekdayCounts: number[];
};

type CalendarSummaryPayload = {
  termSummaries: TermSummaryRecord[];
  vacationSummaries: Array<{
    key: string;
    label: string;
    count: number;
  }>;
};

const normalizeHolidayFlag = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 2 || value === 0) {
      return false;
    }
  }
  return undefined;
};

function sortTerms(a: NormalizedTerm, b: NormalizedTerm) {
  const orderA = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
  const orderB = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return a.termName.localeCompare(b.termName, "ja");
}

export const ensureCalendar = mutation({
  args: {
    name: v.string(),
    fiscalYear: v.number(),
    fiscalStart: v.string(),
    fiscalEnd: v.string(),
  },
  handler: async (ctx, args) => {
    const { name, fiscalYear, fiscalStart, fiscalEnd } = args;
    const existing = await ctx.db
      .query("calendars")
      .withIndex("by_year_name", (q) => q.eq("fiscalYear", fiscalYear).eq("name", name))
      .unique();
    const now = Date.now();
    if (existing) {
      const patch: Partial<Doc<"calendars">> = { updatedAt: now };
      if (typeof existing.downloadCount !== "number" || !Number.isFinite(existing.downloadCount)) {
        patch.downloadCount = 0;
      }
      const normalizedCreatorId = normalizeCreatorId(existing.creatorId);
      if (normalizedCreatorId !== existing.creatorId) {
        patch.creatorId = normalizedCreatorId;
      }
      if (typeof existing.disableSaturday !== "boolean") {
        patch.disableSaturday = false;
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    const id = await ctx.db.insert("calendars", {
      name,
      fiscalYear,
      fiscalStart,
      fiscalEnd,
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      isPublishable: false,
      memo: "",
      inputInformation: "",
      disableSaturday: false,
    });
    return id;
  },
});

export const incrementDownloadCount = internalMutation({
  args: { calendarId: v.id("calendars") },
  handler: async (ctx, { calendarId }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) {
      return;
    }
    const current = resolveDownloadCount(calendar.downloadCount);
    await ctx.db.patch(calendarId, {
      downloadCount: current + 1,
      updatedAt: Date.now(),
    });
  },
});

export const getCalendar = query({
  args: { calendarId: v.id("calendars") },
  handler: async (ctx, { calendarId }): Promise<CalendarDetailPayload | null> => {
    const cal = await ctx.db.get(calendarId);
    if (!cal) return null;
    if (cal.isPublishable !== true) {
      return null;
    }
    const days = await ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) => q.eq("calendarId", calendarId))
      .collect();
    const terms = await ctx.db
      .query("calendar_terms")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    const normalizedTerms = terms
      .map((term) => {
        const name = sanitizeTermName(term.name);
        if (!name) return null;
        const trimmedShortName = sanitizeTermName(term.shortName);
        const normalizedTerm: NormalizedTerm = {
          _id: term._id,
          termName: name,
          order: toFiniteNumber(term.order),
          shortName: trimmedShortName ? trimmedShortName : undefined,
          classCount: toFiniteNumber(term.classCount),
          holidayFlag: normalizeHolidayFlag(term.holidayFlag),
        };
        return normalizedTerm;
      })
      .filter((term): term is NormalizedTerm => term !== null)
      .sort(sortTerms);

    let campuses: Array<{
      campusName: string;
      officeCode?: string;
      officeName?: string;
      class10Code?: string;
      class10Name?: string;
    }> = [];

    const calendarUniversityCode = typeof cal.universityCode === "string" ? cal.universityCode.trim() : "";
    if (calendarUniversityCode.length > 0) {
      const university = await ctx.db
        .query("universities")
        .withIndex("by_code", (q) => q.eq("code", calendarUniversityCode))
        .unique();
      const defaultUniversityName = typeof university?.name === "string" ? university.name.trim() : "";

      const campusRows = await ctx.db
        .query("university_campuses")
        .withIndex("by_university", (q) => q.eq("universityCode", calendarUniversityCode))
        .collect();

      campuses = campusRows.map((campus) => ({
        campusName: (() => {
          const rawName = typeof campus.campusName === "string" ? campus.campusName.trim() : "";
          if (rawName.length > 0) {
            return rawName;
          }
          const campusUniversityName = typeof campus.universityName === "string" ? campus.universityName.trim() : "";
          const baseName = campusUniversityName.length > 0 ? campusUniversityName : defaultUniversityName;
          return baseName.length > 0 ? `${baseName}キャンパス` : "";
        })(),
        officeCode: campus.officeCode ?? undefined,
        officeName: campus.officeName ?? undefined,
        class10Code: campus.class10Code ?? undefined,
        class10Name: campus.class10Name ?? undefined,
      }));
    }

    const disableSaturday = typeof cal.disableSaturday === "boolean" ? cal.disableSaturday : false;
    const calendar: Doc<"calendars"> =
      typeof cal.disableSaturday === "boolean"
        ? cal
        : { ...cal, disableSaturday };

    return { calendar, days, terms: normalizedTerms, campuses };
  },
});

export const getCalendarWithTracking = action({
  args: { calendarId: v.id("calendars") },
  handler: async (ctx, args): Promise<CalendarDetailPayload | null> => {
    const calendarDetails = await ctx.runQuery(api.calendars.getCalendar, args);
    if (!calendarDetails) {
      return null;
    }
    await ctx.scheduler.runAfter(0, internal.calendars.incrementDownloadCount, args);
    return calendarDetails;
  },
});

export const createCalendar = mutation({
  args: {
    name: v.string(),
    universityCode: v.optional(v.string()),
    fiscalYear: v.number(),
    memo: v.optional(v.string()),
    inputInformation: v.optional(v.string()),
    creatorId: v.optional(v.string()),
    disableSaturday: v.optional(v.boolean()),
    terms: v.optional(
      v.array(
        v.object({
          name: v.string(),
          order: v.optional(v.number()),
          shortName: v.optional(v.string()),
          classCount: v.optional(v.number()),
          holidayFlag: v.optional(v.union(v.literal(1), v.literal(2))),
        }),
      ),
    ),
  },
  handler: async (
    ctx,
    { name, universityCode, fiscalYear, memo, inputInformation, creatorId, disableSaturday, terms }
  ) => {
    const fiscalStart = `${String(fiscalYear).padStart(4, "0")}-04-01`;
    const fiscalEnd = `${String(fiscalYear + 1).padStart(4, "0")}-03-31`;
    // 重複チェック（同一大学+年度+名称）
    const dup = await ctx.db
      .query("calendars")
      .withIndex("by_university_year_name", (q) =>
        q
          .eq("universityCode", universityCode ?? undefined)
          .eq("fiscalYear", fiscalYear)
          .eq("name", name)
      )
      .unique();
    if (dup) return dup._id;
    const now = Date.now();
    const trimmedMemo = typeof memo === "string" ? memo.trim() : "";
    const trimmedInput = typeof inputInformation === "string" ? inputInformation.trim() : "";
    const normalizedCreatorId = normalizeCreatorId(creatorId);

    const id = await ctx.db.insert("calendars", {
      name,
      universityCode,
      fiscalYear,
      fiscalStart,
      fiscalEnd,
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      creatorId: normalizedCreatorId,
      isPublishable: false,
      memo: trimmedMemo,
      inputInformation: trimmedInput,
      disableSaturday: disableSaturday === true,
    });

    if (Array.isArray(terms) && terms.length > 0) {
      const sanitizedTerms = terms
        .map((term) => {
          const trimmedName = sanitizeTermName(term.name);
          if (!trimmedName) {
            return null;
          }

          const sanitized: {
            name: string;
            order?: number;
            shortName?: string;
            classCount?: number;
            holidayFlag?: 1 | 2;
          } = { name: trimmedName };

          if (typeof term.order === "number" && Number.isFinite(term.order) && term.order >= 0) {
            sanitized.order = Math.trunc(term.order);
          }

          const shortName = typeof term.shortName === "string" ? term.shortName.trim() : "";
          if (shortName) {
            sanitized.shortName = shortName;
          }

          if (typeof term.classCount === "number" && Number.isFinite(term.classCount) && term.classCount >= 0) {
            sanitized.classCount = Math.trunc(term.classCount);
          }

          if (term.holidayFlag === 1 || term.holidayFlag === 2) {
            sanitized.holidayFlag = term.holidayFlag;
          }

          return sanitized;
        })
        .filter((term): term is { name: string; order?: number; shortName?: string; classCount?: number; holidayFlag?: 1 | 2 } => term !== null);

      const sortedTerms = sanitizedTerms.sort((a, b) => {
        const orderA = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
        const orderB = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.name.localeCompare(b.name, "ja");
      });

      const seenNames = new Set<string>();
      let fallbackOrder = 1;

      for (const term of sortedTerms) {
        if (seenNames.has(term.name)) {
          continue;
        }
        seenNames.add(term.name);

        const resolvedOrder =
          typeof term.order === "number" && Number.isFinite(term.order) ? Math.trunc(term.order) : fallbackOrder;
        fallbackOrder = Math.max(fallbackOrder, resolvedOrder + 1);

        await ctx.db.insert("calendar_terms", {
          calendarId: id,
          name: term.name,
          order: resolvedOrder,
          shortName: term.shortName,
          classCount: term.classCount,
          holidayFlag: term.holidayFlag ?? 2,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return id;
  },
});

export const initializeCalendarDays = action({
  args: {
    calendarId: v.id("calendars"),
    fiscalYear: v.number(),
  },
  returns: v.object({
    initialized: v.boolean(),
    daysInserted: v.number(),
    fromCache: v.boolean(),
  }),
  handler: async (ctx, { calendarId, fiscalYear }): Promise<InitializeCalendarDaysResult> => {
    const calendarInfo = await ctx.runQuery(internal.calendarTools.getCalendarInfo, {
      calendarId,
    });

    if (calendarInfo.dayCount > 0) {
      return { initialized: false, daysInserted: 0, fromCache: true };
    }

    let holidays: HolidayEntry[] = [];
    let fromCache = false;

    const cached = (await ctx.runQuery(internal.holidayCache.getHolidayCache, {
      fiscalYear,
    })) as HolidayCacheRecord | null;

    if (cached?.holidays?.length) {
      holidays = cached.holidays;
      fromCache = true;
    } else {
      const result = (await ctx.runAction(api.holidays.getFiscalHolidays, {
        fiscalYear,
      })) as FiscalHolidayActionResult;
      holidays = result.holidays;
      fromCache = result.fromCache;
    }

    const holidayMap = buildHolidayMap(holidays);
    const daysPayload = enumerateFiscalDates(fiscalYear).map((date) => {
      const holidayName = holidayMap.get(date);
      return {
        date,
        type: "未指定" as const,
        isHoliday: Boolean(holidayName),
        nationalHolidayName: holidayName,
        classWeekday: deriveCalendarWeekday(date),
      };
    });

    if (daysPayload.length > 0) {
      await ctx.runMutation(api.days.setDaysBulk, {
        calendarId,
        days: daysPayload,
      });
    }

    return {
      initialized: true,
      daysInserted: daysPayload.length,
      fromCache,
    };
  },
});

export const listCalendars = query({
  args: {
    universityCode: v.string(),
    fiscalYear: v.number(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { universityCode, fiscalYear, limit }) => {
    const q = ctx.db
      .query("calendars")
      .withIndex("by_university_year", (ix) => ix.eq("universityCode", universityCode).eq("fiscalYear", fiscalYear));
    const rows = await q.collect();
    return rows.filter((row) => row.isPublishable === true);
  },
});

type CalendarRow = {
  _id: Id<"calendars">;
  name: string;
  fiscalYear: number;
  universityCode?: string;
  updatedAt: number;
  downloadCount: number;
  creatorId?: string;
  universityName: string;
  isPublishable: boolean;
  memoPreview?: string;
  allCampusesHaveOfficeCode: boolean;
};

type UniversityCalendarGroup = {
  university: {
    code: string;
    name: string;
    capacity?: number;
    allCampusesHaveOfficeCode: boolean;
  };
  calendars: CalendarRow[];
};

function deriveUniversityNameFromCalendarTitle(calendarName: string): string {
  const trimmed = calendarName.trim();
  if (!trimmed) {
    return "";
  }

  const sanitized = trimmed
    .replace(/(学年暦|年度カレンダー|カレンダー|年間予定表?)$/gu, "")
    .trim();

  return sanitized || trimmed;
}

function compareCalendarRows(a: CalendarRow, b: CalendarRow) {
  const codeA = a.universityCode ?? "";
  const codeB = b.universityCode ?? "";
  if (codeA === codeB) {
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    return a.name.localeCompare(b.name, "ja");
  }
  return codeA.localeCompare(codeB, "ja");
}

function compareCalendarsByDownloadCount(a: CalendarRow, b: CalendarRow) {
  if (a.downloadCount !== b.downloadCount) {
    return b.downloadCount - a.downloadCount;
  }
  return compareCalendarRows(a, b);
}

function compareUniversitiesByCapacity(a: Doc<"universities">, b: Doc<"universities">) {
  const capacityA = typeof a.capacity === "number" ? a.capacity : -1;
  const capacityB = typeof b.capacity === "number" ? b.capacity : -1;
  if (capacityA !== capacityB) {
    return capacityB - capacityA;
  }
  const nameCompare = a.name.localeCompare(b.name, "ja");
  if (nameCompare !== 0) {
    return nameCompare;
  }
  return a.code.localeCompare(b.code, "ja");
}

function buildMemoPreview(cal: Doc<"calendars">): string | undefined {
  if (typeof cal.memo !== "string") {
    return undefined;
  }
  const normalizedMemo = cal.memo.replace(/\s+/g, " ").trim();
  if (!normalizedMemo) {
    return undefined;
  }
  return Array.from(normalizedMemo).slice(0, 20).join("");
}

async function computeCampusOfficeStatus(ctx: QueryCtx, codes: string[]) {
  const uniqueCodes = Array.from(
    new Set(
      codes.filter((code): code is string => typeof code === "string" && code.length > 0)
    )
  );
  const pairs = await Promise.all(
    uniqueCodes.map(async (code) => {
      const campuses = await ctx.db
        .query("university_campuses")
        .withIndex("by_university", (ix) => ix.eq("universityCode", code))
        .collect();
      if (campuses.length === 0) {
        return [code, false] as const;
      }
      const allHaveOfficeCode = campuses.every((campus) => {
        const codeValue = typeof campus.officeCode === "string" ? campus.officeCode.trim() : "";
        return codeValue.length > 0;
      });
      return [code, allHaveOfficeCode] as const;
    })
  );
  return new Map(pairs);
}

async function attachUniversityNames(
  ctx: QueryCtx,
  calendars: Doc<"calendars">[]
): Promise<CalendarRow[]> {
  const codes = Array.from(
    new Set(
      calendars
        .map((cal) => cal.universityCode)
        .filter((code): code is string => typeof code === "string" && code.length > 0)
    )
  );

  const universityInfoPairs = await Promise.all(
    codes.map(async (code) => {
      const [university, campuses] = await Promise.all([
        ctx.db.query("universities").withIndex("by_code", (ix) => ix.eq("code", code)).unique(),
        ctx.db
          .query("university_campuses")
          .withIndex("by_university", (ix) => ix.eq("universityCode", code))
          .collect(),
      ]);

      const hasCampuses = campuses.length > 0;
      const allCampusesHaveOfficeCode =
        hasCampuses &&
        campuses.every((campus) => {
          const codeValue = typeof campus.officeCode === "string" ? campus.officeCode.trim() : "";
          return codeValue.length > 0;
        });

      return [
        code,
        {
          name: university?.name ?? "",
          allCampusesHaveOfficeCode,
        },
      ] as const;
    })
  );
  const infoMap = new Map<string, { name: string; allCampusesHaveOfficeCode: boolean }>(
    universityInfoPairs
  );

  return calendars.map((cal) => {
    const creatorId = normalizeCreatorId(cal.creatorId);
    const universityInfo = cal.universityCode ? infoMap.get(cal.universityCode) : undefined;
    const resolvedUniversityName = (() => {
      const mappedName = typeof universityInfo?.name === "string" ? universityInfo.name.trim() : "";
      if (mappedName) {
        return mappedName;
      }
      const derived = deriveUniversityNameFromCalendarTitle(cal.name);
      if (derived) {
        return derived;
      }
      const fallbackCode = typeof cal.universityCode === "string" ? cal.universityCode.trim() : "";
      if (fallbackCode) {
        return fallbackCode;
      }
      return cal.name.trim();
    })();

    return {
      _id: cal._id,
      name: cal.name,
      fiscalYear: cal.fiscalYear,
      universityCode: cal.universityCode ?? undefined,
      updatedAt: cal.updatedAt,
      downloadCount: resolveDownloadCount(cal.downloadCount),
      creatorId,
      universityName: resolvedUniversityName,
      isPublishable: cal.isPublishable === true,
      allCampusesHaveOfficeCode:
        cal.universityCode ? universityInfo?.allCampusesHaveOfficeCode ?? false : false,
      memoPreview: buildMemoPreview(cal),
    };
  });
}

async function getCalendarsSortedByDownloadCount(
  ctx: QueryCtx,
  fiscalYear: number,
  limitCount: number,
  includeUnpublishable: boolean
): Promise<CalendarRow[]> {
  const fetchMultiplier = includeUnpublishable ? 1 : 3;
  const fetchCount = Math.max(limitCount * fetchMultiplier, limitCount);
  const candidates = await ctx.db
    .query("calendars")
    .withIndex("by_year_download", (ix) => ix.eq("fiscalYear", fiscalYear))
    .order("desc")
    .take(fetchCount);

  const visible = includeUnpublishable
    ? candidates
    : candidates.filter((cal) => cal.isPublishable === true);
  if (visible.length === 0) {
    return [];
  }

  const rows = await attachUniversityNames(ctx, visible);
  const publishableRows = includeUnpublishable
    ? rows
    : rows.filter((row) => row.isPublishable === true);

  if (publishableRows.length === 0) {
    return [];
  }

  publishableRows.sort(compareCalendarsByDownloadCount);
  return publishableRows.slice(0, limitCount);
}

export const searchCalendarsForAdmin = query({
  args: {
    q: v.string(),
    fiscalYear: v.number(),
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
  },
  handler: async (ctx, { q, fiscalYear, limit, skip }) => {
    const keyword = q.trim();
    const rawLimit = typeof limit === "number" && Number.isFinite(limit) ? limit : 50;
    const limitCount = Math.max(1, Math.min(Math.floor(rawLimit), 200));
    const offset = typeof skip === "number" && Number.isFinite(skip) ? Math.max(0, Math.floor(skip)) : 0;

    const calendarDocs: Doc<"calendars">[] = [];

    if (!keyword) {
      const candidates = await ctx.db
        .query("calendars")
        .withIndex("by_year", (ix) => ix.eq("fiscalYear", fiscalYear))
        .collect();

      for (const cal of candidates) {
        calendarDocs.push(cal);
      }
    } else {
      const candidateUniversities = await ctx.db
        .query("universities")
        .withIndex("by_name", (ix) => ix.gte("name", keyword))
        .collect();

      const matchedUniversities = candidateUniversities.filter((uni) => uni.name.includes(keyword));

      for (const uni of matchedUniversities) {
        const uniCalendars = await ctx.db
          .query("calendars")
          .withIndex("by_university_year", (ix) => ix.eq("universityCode", uni.code).eq("fiscalYear", fiscalYear))
          .collect();

        for (const cal of uniCalendars) {
          calendarDocs.push(cal);
        }
      }
    }

    if (calendarDocs.length === 0) {
      return {
        rows: [],
        totalCount: 0,
      } as const;
    }

    const rows = await attachUniversityNames(ctx, calendarDocs);
    rows.sort(compareCalendarRows);

    const paginatedRows = rows.slice(offset, offset + limitCount);

    return {
      rows: paginatedRows,
      totalCount: rows.length,
    } as const;
  },
});

export const searchCalendarsByUniversityName = query({
  // 管理画面とモバイルアプリが共通で利用する検索クエリ。
  // includeUnpublishable を true にした場合のみ、非公開カレンダーも返す。
  args: {
    q: v.string(),
    fiscalYear: v.number(),
    limit: v.optional(v.number()),
    includeUnpublishable: v.optional(v.boolean()),
  },
  handler: async (ctx, { q, fiscalYear, limit, includeUnpublishable }) => {
    const keyword = q.trim();
    const rawLimit = typeof limit === "number" && Number.isFinite(limit) ? limit : 50;
    const limitCount = Math.max(1, Math.min(Math.floor(rawLimit), 50));
    const showAllCalendars = includeUnpublishable === true;

    if (!keyword) {
      return await getCalendarsSortedByDownloadCount(ctx, fiscalYear, limitCount, showAllCalendars);
    }

    const candidateUniversities = await ctx.db
      .query("universities")
      .withIndex("by_name", (ix) => ix.gte("name", keyword))
      .take(limitCount * 5);

    const matchedUniversities = candidateUniversities
      .filter((uni) => uni.name.includes(keyword))
      .slice(0, limitCount);

    if (matchedUniversities.length === 0) return [];

    const calendarDocs: Doc<"calendars">[] = [];

    for (const uni of matchedUniversities) {
      const uniCalendars = await ctx.db
        .query("calendars")
        .withIndex("by_university_year", (ix) => ix.eq("universityCode", uni.code).eq("fiscalYear", fiscalYear))
        .collect();

      for (const cal of uniCalendars) {
        if (!showAllCalendars && cal.isPublishable !== true) {
          continue;
        }
        calendarDocs.push(cal);
      }
    }

    if (calendarDocs.length === 0) {
      return [];
    }

    const rows = await attachUniversityNames(ctx, calendarDocs);
    rows.sort(compareCalendarRows);
    return rows.slice(0, limitCount);
  },
});

export const listTopCalendarsByDownloadCount = query({
  args: {
    fiscalYear: v.number(),
    limit: v.optional(v.number()),
    includeUnpublishable: v.optional(v.boolean()),
  },
  handler: async (ctx, { fiscalYear, limit, includeUnpublishable }) => {
    const rawLimit = typeof limit === "number" && Number.isFinite(limit) ? limit : 50;
    const limitCount = Math.max(1, Math.min(Math.floor(rawLimit), 50));
    const showAllCalendars = includeUnpublishable === true;
    const rows = await getCalendarsSortedByDownloadCount(
      ctx,
      fiscalYear,
      limitCount,
      showAllCalendars
    );

    const filteredRows = showAllCalendars ? rows : rows.filter((row) => row.isPublishable);

    return filteredRows.map((row) => ({
      calendarId: row._id,
      calendarName: row.name,
      universityName: row.universityName.trim() || deriveUniversityNameFromCalendarTitle(row.name),
    }));
  },
});

export const listUniversitiesWithCalendarsForAdmin = query({
  args: {
    q: v.string(),
    fiscalYear: v.number(),
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
  },
  handler: async (ctx, { q, fiscalYear, limit, skip }) => {
    const keyword = q.trim();
    const rawLimit = typeof limit === "number" && Number.isFinite(limit) ? limit : 20;
    const limitCount = Math.max(1, Math.min(Math.floor(rawLimit), 200));
    const offset = typeof skip === "number" && Number.isFinite(skip) ? Math.max(0, Math.floor(skip)) : 0;

    let universities: Doc<"universities">[];
    if (!keyword) {
      universities = await ctx.db.query("universities").collect();
    } else {
      const candidates = await ctx.db
        .query("universities")
        .withIndex("by_name", (ix) => ix.gte("name", keyword))
        .collect();
      universities = candidates.filter((uni) => uni.name.includes(keyword));
    }

    if (universities.length === 0) {
      return {
        groups: [] as UniversityCalendarGroup[],
        totalCount: 0,
      } as const;
    }

    universities.sort(compareUniversitiesByCapacity);

    const totalCount = universities.length;
    const paginated = universities.slice(offset, offset + limitCount);

    const campusStatusMap = await computeCampusOfficeStatus(
      ctx,
      paginated.map((uni) => uni.code)
    );

    const groups = await Promise.all(
      paginated.map(async (uni) => {
        const calendars = await ctx.db
          .query("calendars")
          .withIndex("by_university_year", (ix) => ix.eq("universityCode", uni.code).eq("fiscalYear", fiscalYear))
          .collect();

        const allCampusesHaveOfficeCode = campusStatusMap.get(uni.code) ?? false;

        const calendarRows = calendars.map<CalendarRow>((cal) => ({
          _id: cal._id,
          name: cal.name,
          fiscalYear: cal.fiscalYear,
          universityCode: cal.universityCode ?? undefined,
          updatedAt: cal.updatedAt,
          downloadCount: resolveDownloadCount(cal.downloadCount),
          creatorId: normalizeCreatorId(cal.creatorId),
          universityName: uni.name,
          isPublishable: cal.isPublishable === true,
          memoPreview: buildMemoPreview(cal),
          allCampusesHaveOfficeCode,
        }));

        calendarRows.sort(compareCalendarRows);

        return {
          university: {
            code: uni.code,
            name: uni.name,
            capacity: typeof uni.capacity === "number" ? uni.capacity : undefined,
            allCampusesHaveOfficeCode,
          },
          calendars: calendarRows,
        } satisfies UniversityCalendarGroup;
      })
    );

    return {
      groups,
      totalCount,
    } as const;
  },
});

export const deleteCalendar = mutation({
  args: { calendarId: v.id("calendars") },
  handler: async (ctx, { calendarId }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) {
      throw new Error("指定されたカレンダーが見つかりません。");
    }

    const days = await ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) => q.eq("calendarId", calendarId))
      .collect();
    for (const day of days) {
      await ctx.db.delete(day._id);
    }

    const terms = await ctx.db
      .query("calendar_terms")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();
    for (const term of terms) {
      await ctx.db.delete(term._id);
    }

    await ctx.db.delete(calendarId);

    return {
      deletedDays: days.length,
      deletedTerms: terms.length,
    };
  },
});

export const setPublishableStatus = mutation({
  args: {
    calendarId: v.id("calendars"),
    isPublishable: v.boolean(),
    forcePublish: v.optional(v.boolean()),
    disableSaturdayOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, { calendarId, isPublishable, forcePublish, disableSaturdayOverride }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) {
      throw new Error("指定されたカレンダーが見つかりません。");
    }
    const saturdayDisabled =
      typeof disableSaturdayOverride === "boolean"
        ? disableSaturdayOverride
        : (calendar as { disableSaturday?: boolean }).disableSaturday === true;
    const weekdayIndexes = saturdayDisabled ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5];
    const weekdayLabels = ["月", "火", "水", "木", "金", "土"] as const;

    if (isPublishable) {
      const calendarSummary: CalendarSummaryPayload = await ctx.runQuery(
        api.termManager.getCalendarSummary,
        { calendarId },
      );
      const relevantStats = calendarSummary.termSummaries.filter(
        (stat): stat is TermSummaryRecord & { termId: Id<"calendar_terms"> } => Boolean(stat.termId),
      );

      if (relevantStats.length === 0) {
        throw new Error("授業日に紐付いた学期が存在しません。カウント更新後に再試行してください。");
      }

      const reference = relevantStats[0]?.weekdayCounts ?? [];
      const referenceCounts = weekdayIndexes.map((index) => reference[index] ?? 0);
      const mismatched = relevantStats.some((stat) => {
        const counts = Array.isArray(stat.weekdayCounts) ? stat.weekdayCounts : [];
        return weekdayIndexes.some((index, offset) => {
          const count = counts[index] ?? 0;
          return count !== referenceCounts[offset];
        });
      });

      if (mismatched && forcePublish !== true) {
        throw new Error("学期ごとの授業日数が揃っていません。");
      }

      const zeroWeekdayIndices = weekdayIndexes.filter((index, offset) => referenceCounts[offset] === 0);
      if (zeroWeekdayIndices.length > 0 && forcePublish !== true) {
        const zeroLabels = zeroWeekdayIndices.map((index) => weekdayLabels[index] ?? `${index + 1}曜日`);
        throw new Error(`授業日数が0件の曜日があります（${zeroLabels.join("・")}）。`);
      }
    }

    await ctx.db.patch(calendarId, {
      isPublishable,
      updatedAt: Date.now(),
    });

    return { calendarId, isPublishable };
  },
});

export const renameCalendar = mutation({
  args: {
    calendarId: v.id("calendars"),
    name: v.string(),
  },
  returns: v.object({ renamed: v.boolean(), name: v.string() }),
  handler: async (ctx, { calendarId, name }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) {
      throw new Error("指定されたカレンダーが見つかりません。");
    }

    const normalized = name.trim();
    if (!normalized) {
      throw new Error("学事予定の名称を入力してください。");
    }

    if (normalized === calendar.name) {
      return { renamed: false, name: calendar.name };
    }

    const duplicate = await ctx.db
      .query("calendars")
      .withIndex("by_university_year_name", (q) =>
        q
          .eq("universityCode", calendar.universityCode ?? undefined)
          .eq("fiscalYear", calendar.fiscalYear)
          .eq("name", normalized)
      )
      .unique();

    if (duplicate && duplicate._id !== calendarId) {
      throw new Error("同じ名称の学事予定が既に存在します。");
    }

    await ctx.db.patch(calendarId, {
      name: normalized,
      updatedAt: Date.now(),
    });

    return { renamed: true, name: normalized };
  },
});

export const updateCalendarNotes = mutation({
  args: {
    calendarId: v.id("calendars"),
    memo: v.optional(v.string()),
    inputInformation: v.optional(v.string()),
    disableSaturday: v.optional(v.boolean()),
  },
  handler: async (ctx, { calendarId, memo, inputInformation, disableSaturday }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) {
      throw new Error("指定されたカレンダーが見つかりません。");
    }

    const normalizedMemo = typeof memo === "string" ? memo.trim() : "";
    const normalizedInput = typeof inputInformation === "string" ? inputInformation.trim() : "";

    await ctx.db.patch(calendarId, {
      memo: normalizedMemo,
      inputInformation: normalizedInput,
      disableSaturday: disableSaturday === true,
      updatedAt: Date.now(),
    });

    return { calendarId };
  },
});

export const copyCalendarData = mutation({
  args: {
    targetCalendarId: v.id("calendars"),
    sourceCalendarId: v.id("calendars"),
  },
  returns: v.object({
    termCount: v.number(),
    dayCount: v.number(),
  }),
  handler: async (ctx, { targetCalendarId, sourceCalendarId }) => {
    if (targetCalendarId === sourceCalendarId) {
      throw new Error("同じカレンダーからはコピーできません。");
    }

    const [targetCalendar, sourceCalendar] = await Promise.all([
      ctx.db.get(targetCalendarId),
      ctx.db.get(sourceCalendarId),
    ]);

    if (!targetCalendar) {
      throw new Error("コピー先のカレンダーが見つかりません。");
    }
    if (!sourceCalendar) {
      throw new Error("コピー元のカレンダーが見つかりません。");
    }

    const [sourceTerms, sourceDays] = await Promise.all([
      ctx.db
        .query("calendar_terms")
        .withIndex("by_calendar", (ix) => ix.eq("calendarId", sourceCalendarId))
        .collect(),
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_date", (ix) => ix.eq("calendarId", sourceCalendarId))
        .collect(),
    ]);

    const [targetTerms, targetDays] = await Promise.all([
      ctx.db
        .query("calendar_terms")
        .withIndex("by_calendar", (ix) => ix.eq("calendarId", targetCalendarId))
        .collect(),
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_date", (ix) => ix.eq("calendarId", targetCalendarId))
        .collect(),
    ]);

    for (const day of targetDays) {
      await ctx.db.delete(day._id);
    }

    for (const term of targetTerms) {
      await ctx.db.delete(term._id);
    }

    const sortedSourceTerms = [...sourceTerms].sort((a, b) => {
      const orderA = typeof a.order === "number" && Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === "number" && Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name, "ja");
    });

    const termIdMap = new Map<Id<"calendar_terms">, Id<"calendar_terms">>();
    const now = Date.now();

    for (const term of sortedSourceTerms) {
      const insertedId = await ctx.db.insert("calendar_terms", {
        calendarId: targetCalendarId,
        name: term.name,
        order: typeof term.order === "number" && Number.isFinite(term.order) ? term.order : undefined,
        shortName:
          typeof term.shortName === "string" && term.shortName.trim().length > 0
            ? term.shortName.trim()
            : undefined,
        classCount:
          typeof term.classCount === "number" && Number.isFinite(term.classCount)
            ? term.classCount
            : undefined,
        holidayFlag:
          typeof term.holidayFlag === "number" && Number.isFinite(term.holidayFlag)
            ? term.holidayFlag
            : undefined,
        createdAt: typeof term.createdAt === "number" && Number.isFinite(term.createdAt) ? term.createdAt : now,
        updatedAt: now,
      });
      termIdMap.set(term._id, insertedId);
    }

    const sortedSourceDays = [...sourceDays].sort((a, b) => a.date.localeCompare(b.date));

    for (const day of sortedSourceDays) {
      const mappedTermId = day.termId ? termIdMap.get(day.termId as Id<"calendar_terms">) : undefined;
      const normalizedDescription =
        typeof day.description === "string" && day.description.trim().length > 0
          ? day.description.trim()
          : undefined;
      const normalizedHolidayName =
        typeof day.nationalHolidayName === "string" && day.nationalHolidayName.trim().length > 0
          ? day.nationalHolidayName.trim()
          : undefined;
      const normalizedWeekday =
        typeof day.classWeekday === "number" && Number.isFinite(day.classWeekday)
          ? Math.max(1, Math.min(7, Math.trunc(day.classWeekday)))
          : undefined;
      const normalizedClassOrder =
        typeof day.classOrder === "number" && Number.isFinite(day.classOrder)
          ? Math.max(1, Math.trunc(day.classOrder))
          : undefined;
      const normalizedNotificationReasons =
        typeof day.notificationReasons === "string" && day.notificationReasons.trim().length > 0
          ? day.notificationReasons.trim()
          : undefined;

      await ctx.db.insert("calendar_days", {
        calendarId: targetCalendarId,
        date: day.date,
        type: day.type,
        termId: mappedTermId,
        description: normalizedDescription,
        isHoliday: day.isHoliday === true,
        nationalHolidayName: normalizedHolidayName,
        classWeekday: normalizedWeekday,
        classOrder: normalizedClassOrder,
        notificationReasons: normalizedNotificationReasons,
        updatedAt: now,
      });
    }

    await ctx.db.patch(targetCalendarId, {
      memo: typeof sourceCalendar.memo === "string" ? sourceCalendar.memo : "",
      inputInformation:
        typeof sourceCalendar.inputInformation === "string" ? sourceCalendar.inputInformation : "",
      disableSaturday: sourceCalendar.disableSaturday === true,
      updatedAt: now,
    });

    return {
      termCount: sourceTerms.length,
      dayCount: sourceDays.length,
    };
  },
});

// 全てのカレンダーを取得
export const getAllCalendars = query({
  args: {},
  handler: async (ctx) => {
    const calendars = await ctx.db.query("calendars").collect();
    if (calendars.length === 0) {
      return [];
    }

    const rows = await attachUniversityNames(ctx, calendars);
    const calendarMap = new Map(calendars.map((calendar) => [calendar._id, calendar] as const));

    return rows.map((row) => ({
      ...calendarMap.get(row._id)!,
      universityName: row.universityName,
      allCampusesHaveOfficeCode: row.allCampusesHaveOfficeCode,
    }));
  },
});

export const getCalendarMetadata = query({
  args: { calendarId: v.id("calendars") },
  handler: async (ctx, { calendarId }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) {
      return null;
    }

    return {
      _id: calendar._id,
      name: calendar.name,
      fiscalYear: calendar.fiscalYear,
      memo: calendar.memo ?? "",
      inputInformation: calendar.inputInformation ?? "",
      downloadCount: resolveDownloadCount(calendar.downloadCount),
      creatorId: normalizeCreatorId(calendar.creatorId),
    };
  },
});
