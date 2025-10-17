import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const VACATIONS = [
  { key: "springBreak", label: "春休み" },
  { key: "summerBreak", label: "夏休み" },
  { key: "winterBreak", label: "冬休み" },
] as const;

type VacationKey = (typeof VACATIONS)[number]["key"];

// 期間ごとの曜日別授業日数統計と長期休暇日数を取得
type TermSummaryRow = {
  termId?: Id<"calendar_terms">;
  termName: string;
  weekdayCounts: number[];
};

type VacationCounts = Record<VacationKey, number>;

type VacationSummaryRow = {
  key: VacationKey;
  label: string;
  count: number;
};

export const getCalendarSummary = query({
  args: {
    calendarId: v.id("calendars"),
  },
  returns: v.object({
    termSummaries: v.array(
      v.object({
        termId: v.optional(v.id("calendar_terms")),
        termName: v.string(),
        weekdayCounts: v.array(v.number()), // [月, 火, 水, 木, 金, 土]
      }),
    ),
    vacationSummaries: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        count: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { calendarId }) => {
    const calendar = await ctx.db.get(calendarId);
    const saturdayDisabled = (calendar as { disableSaturday?: boolean } | null)?.disableSaturday === true;

    // 授業日のみを取得
    const [classDays, vacationDays, terms] = await Promise.all([
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_type", (q) =>
          q.eq("calendarId", calendarId).eq("type", "授業日")
        )
        .collect(),
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_type", (q) =>
          q.eq("calendarId", calendarId).eq("type", "休講日")
        )
        .collect(),
      ctx.db
        .query("calendar_terms")
        .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
        .collect(),
    ]);

    const termMeta = new Map<string, { name: string; order: number | undefined }>();
    for (const term of terms) {
      const trimmedName = term.name?.trim();
      const orderValue = typeof term.order === "number" && Number.isFinite(term.order)
        ? term.order
        : undefined;
      if (trimmedName) {
        termMeta.set(term._id, { name: trimmedName, order: orderValue });
      } else {
        termMeta.set(term._id, { name: "名称未設定", order: orderValue });
      }
    }

    const UNASSIGNED_KEY = "__unassigned__";
    const statsByTerm = new Map<string, { termId?: Id<"calendar_terms">; weekdayCounts: number[] }>();

    for (const day of classDays) {
      const termId = day.termId ? (day.termId as Id<"calendar_terms">) : undefined;
      const key = termId ?? UNASSIGNED_KEY;
      if (!statsByTerm.has(key)) {
        statsByTerm.set(key, {
          termId,
          weekdayCounts: [0, 0, 0, 0, 0, 0],
        });
      }

      const entry = statsByTerm.get(key)!;
      const classWeekday = day.classWeekday;
      const manualWeekday =
        typeof classWeekday === "number" && Number.isFinite(classWeekday)
          ? Math.trunc(classWeekday)
          : undefined;
      const weekdayFromManual =
        typeof manualWeekday === "number" ? ((manualWeekday % 7) + 7) % 7 : undefined;
      const parsedDate = Date.parse(`${day.date}T00:00:00Z`);
      const jsWeekday = Number.isNaN(parsedDate) ? 0 : new Date(parsedDate).getUTCDay();
      const resolvedWeekday = weekdayFromManual ?? jsWeekday;

      if (resolvedWeekday >= 1 && resolvedWeekday <= 6) {
        if (saturdayDisabled && resolvedWeekday === 6) {
          continue;
        }
        entry.weekdayCounts[resolvedWeekday - 1]++;
      }
    }

    const sorted = Array.from(statsByTerm.values())
      .map((entry) => {
        const meta = entry.termId ? termMeta.get(entry.termId) : undefined;
        const displayName = entry.termId
          ? (meta?.name ?? "名称未設定")
          : "未分類";
        const orderValue = meta?.order ?? Number.MAX_SAFE_INTEGER;
        return {
          termId: entry.termId,
          termName: displayName,
          weekdayCounts: entry.weekdayCounts,
          order: orderValue,
        };
      })
      .sort((a, b) => {
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return a.termName.localeCompare(b.termName, "ja");
      });

    const vacationCounts: VacationCounts = {
      springBreak: 0,
      summerBreak: 0,
      winterBreak: 0,
    };

    const vacationLabelMap = new Map<string, VacationKey>();
    for (const vacation of VACATIONS) {
      vacationLabelMap.set(vacation.label, vacation.key);
    }

    for (const day of vacationDays) {
      if (!day.termId) {
        continue;
      }

      const resolvedTermId = day.termId as Id<"calendar_terms">;
      const meta = termMeta.get(resolvedTermId);
      const name = meta?.name ?? "";
      const matchedKey = vacationLabelMap.get(name);
      if (matchedKey) {
        vacationCounts[matchedKey]++;
      }
    }

    const termSummaries = sorted.map(({ termId, termName, weekdayCounts }): TermSummaryRow => ({
      termId: termId ?? undefined,
      termName,
      weekdayCounts,
    }));

    const vacationSummaries: VacationSummaryRow[] = VACATIONS.map(({ key, label }) => ({
      key,
      label,
      count: vacationCounts[key],
    }));

    return {
      termSummaries,
      vacationSummaries,
    };
  },
});

// カレンダーから一意の期間名一覧を取得
export const getUniqueTerms = query({
  args: {
    calendarId: v.id("calendars"),
  },
  returns: v.array(
    v.object({
      termId: v.optional(v.id("calendar_terms")),
      name: v.string(),
    })
  ),
  handler: async (ctx, { calendarId }) => {
    const [days, terms] = await Promise.all([
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_date", (q) => q.eq("calendarId", calendarId))
        .collect(),
      ctx.db
        .query("calendar_terms")
        .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
        .collect(),
    ]);

    const termMeta = new Map<string, { name: string; order: number | undefined }>();
    for (const term of terms) {
      const trimmedName = term.name?.trim();
      const orderValue = typeof term.order === "number" && Number.isFinite(term.order)
        ? term.order
        : undefined;
      if (trimmedName) {
        termMeta.set(term._id, { name: trimmedName, order: orderValue });
      } else {
        termMeta.set(term._id, { name: "名称未設定", order: orderValue });
      }
    }

    const uniqueTermIds = new Set<Id<"calendar_terms">>();
    let includeUnassigned = false;

    for (const day of days) {
      if (day.termId) {
        uniqueTermIds.add(day.termId as Id<"calendar_terms">);
      } else {
        includeUnassigned = true;
      }
    }

    const entries: Array<{ termId?: Id<"calendar_terms">; name: string; order: number }> = [];

    if (includeUnassigned) {
      entries.push({
        termId: undefined,
        name: "未分類",
        order: Number.MAX_SAFE_INTEGER,
      });
    }

    for (const termId of uniqueTermIds) {
      const meta = termMeta.get(termId);
      entries.push({
        termId,
        name: meta?.name ?? "名称未設定",
        order: meta?.order ?? Number.MAX_SAFE_INTEGER - 1,
      });
    }

    entries.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.name.localeCompare(b.name, "ja");
    });

    return entries.map(({ termId, name }) => ({
      termId: termId ?? undefined,
      name,
    }));
  },
});

// 期間と授業曜日から該当する授業日を取得
export const getTermWeekdayDates = query({
  args: {
    calendarId: v.id("calendars"),
    termId: v.optional(v.id("calendar_terms")),
    weekday: v.string(),
  },
  returns: v.array(
    v.object({
      date: v.string(),
      type: v.string(),
      termId: v.optional(v.id("calendar_terms")),
      termName: v.optional(v.string()),
      calendarWeekday: v.string(),
      assignedWeekday: v.string(),
      classWeekday: v.optional(v.number()),
      classOrder: v.optional(v.number()),
      notificationReasons: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { calendarId, termId, weekday }) => {
    const weekdayMap: Record<string, number> = {
      "日": 0,
      "月": 1,
      "火": 2,
      "水": 3,
      "木": 4,
      "金": 5,
      "土": 6,
    };

    const normalizedWeekday = weekday.trim();
    if (!(normalizedWeekday in weekdayMap)) {
      return [];
    }

    const targetWeekday = weekdayMap[normalizedWeekday];
    const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

    const [classDays, termRecord] = await Promise.all([
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_type", (q) =>
          q.eq("calendarId", calendarId).eq("type", "授業日")
        )
        .collect(),
      termId ? ctx.db.get(termId) : Promise.resolve(null),
    ]);

    const resolvedTermName = termId
      ? (() => {
          const raw = termRecord?.name?.trim();
          return raw && raw.length > 0 ? raw : "名称未設定";
        })()
      : undefined;

    const filtered = classDays
      .filter((day) => {
        const recordTermId = day.termId ?? undefined;

        if (termId) {
          if (recordTermId !== termId) {
            return false;
          }
        } else if (recordTermId) {
          return false;
        }

        const date = new Date(day.date);
        if (Number.isNaN(date.getTime())) {
          return false;
        }

        const assigned = day.classWeekday !== undefined
          ? day.classWeekday % 7
          : date.getDay();

        return assigned === targetWeekday;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return filtered.map((day) => {
      const date = new Date(day.date);
      const calendarWeekday = Number.isNaN(date.getTime())
        ? ""
        : weekdayLabels[date.getDay()];
      const assigned = day.classWeekday !== undefined
        ? day.classWeekday % 7
        : date.getDay();
      const assignedWeekday = assigned >= 0 && assigned < weekdayLabels.length
        ? weekdayLabels[assigned]
        : "不明";

      return {
        date: day.date,
        type: day.type,
        termId: day.termId ?? undefined,
        termName: termId ? resolvedTermName : undefined,
        calendarWeekday,
        assignedWeekday,
        classWeekday: day.classWeekday ?? undefined,
        classOrder: day.classOrder ?? undefined,
        notificationReasons: typeof day.notificationReasons === "string" && day.notificationReasons.length > 0
          ? day.notificationReasons
          : undefined,
      };
    });
  },
});
