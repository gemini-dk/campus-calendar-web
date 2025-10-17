"use node";

import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { holidayArrayValidator, type HolidayEntry, type HolidayCacheRecord } from "./holidayTypes";

const HOLIDAYS_API_URL = "https://holidays-jp.github.io/api/v1/date.json";

type GetFiscalHolidaysResult = {
  holidays: HolidayEntry[];
  fromCache: boolean;
  fetchedAt: number;
};

function fiscalRange(year: number): { start: string; end: string } {
  const start = `${year.toString().padStart(4, "0")}-04-01`;
  const end = `${(year + 1).toString().padStart(4, "0")}-03-31`;
  return { start, end };
}

async function fetchHolidaysFromSource(year: number): Promise<HolidayEntry[]> {
  const res = await fetch(HOLIDAYS_API_URL);
  if (!res.ok) {
    throw new Error("Failed to fetch Holidays JP API");
  }
  const raw = (await res.json()) as Record<string, string>;
  const { start, end } = fiscalRange(year);
  return Object.entries(raw)
    .filter(([date]) => date >= start && date <= end)
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const getFiscalHolidaysHandler = async (
  ctx: ActionCtx,
  { fiscalYear, forceRefresh }: { fiscalYear: number; forceRefresh?: boolean }
): Promise<GetFiscalHolidaysResult> => {
  const cached: HolidayCacheRecord | null = await ctx.runQuery(
    internal.holidayCache.getHolidayCache,
    {
      fiscalYear,
    }
  );

  if (cached && !forceRefresh) {
    return {
      holidays: cached.holidays,
      fromCache: true,
      fetchedAt: cached.fetchedAt,
    };
  }

  const holidays = await fetchHolidaysFromSource(fiscalYear);
  const now = Date.now();

  await ctx.runMutation(internal.holidayCache.saveHolidayCache, {
    fiscalYear,
    holidays,
    fetchedAt: now,
  });

  return {
    holidays,
    fromCache: Boolean(cached),
    fetchedAt: now,
  };
};

export const getFiscalHolidays = action({
  args: {
    fiscalYear: v.number(),
    forceRefresh: v.optional(v.boolean()),
  },
  returns: v.object({
    holidays: holidayArrayValidator,
    fromCache: v.boolean(),
    fetchedAt: v.number(),
  }),
  handler: getFiscalHolidaysHandler,
});
