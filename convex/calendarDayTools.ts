import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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
  input: unknown,
  dateIso: string,
  fallback?: number
): number => {
  if (typeof input === "number" && Number.isFinite(input) && input >= 1 && input <= 7) {
    return Math.trunc(input);
  }
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback >= 1 && fallback <= 7) {
    return Math.trunc(fallback);
  }
  return deriveClassWeekday(dateIso);
};

export const clearCalendarDays = internalMutation({
  args: {
    calendarId: v.id("calendars"),
  },
  returns: v.object({
    deletedCount: v.number(),
  }),
  handler: async (ctx, { calendarId }) => {
    const rows = await ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) => q.eq("calendarId", calendarId))
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    return {
      deletedCount: rows.length,
    };
  },
});

// 日付タイプ変更ミューテーション（内部用）
export const updateDayType = internalMutation({
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
  },
  returns: v.null(),
  handler: async (ctx, { calendarId, date, type }) => {
    // 既存のレコードを検索
    const existingDay = await ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) => 
        q.eq("calendarId", calendarId).eq("date", date)
      )
      .unique();

    if (existingDay) {
      // 既存レコードを更新（既存の値を明示的に保持）
      await ctx.db.patch(existingDay._id, {
        type,
        termId: existingDay.termId, // 既存のtermIdを保持
        description: existingDay.description, // 既存のdescriptionを保持
        isHoliday: existingDay.isHoliday, // 既存のisHolidayを保持
        nationalHolidayName: existingDay.nationalHolidayName, // 既存のnationalHolidayNameを保持
        classWeekday: existingDay.classWeekday, // 既存のclassWeekdayを保持
        classOrder: existingDay.classOrder, // 既存のclassOrderを保持
        updatedAt: Date.now(),
      });
    } else {
      // 新規レコードを作成
      await ctx.db.insert("calendar_days", {
        calendarId,
        date,
        type,
        classWeekday: deriveClassWeekday(date),
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

// 日付タイプ変更ミューテーション（拡張版・内部用）
export const updateDayTypeExtended = internalMutation({
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
    dayOfWeek: v.optional(v.number()), // 1-7 (月曜日=1)
    description: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { calendarId, date, type, termId, dayOfWeek, description }) => {
    // 既存のレコードを検索
    const existingDay = await ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) =>
        q.eq("calendarId", calendarId).eq("date", date)
      )
      .unique();

    if (existingDay) {
      // 既存レコードを更新
      const nextClassWeekday = normalizeClassWeekday(dayOfWeek, date, existingDay?.classWeekday);

      await ctx.db.patch(existingDay._id, {
        type,
        termId: termId !== undefined ? termId : existingDay.termId,
        classWeekday: nextClassWeekday,
        description:
          description !== undefined
            ? description ?? undefined
            : existingDay.description,
        isHoliday: existingDay.isHoliday, // 既存のisHolidayを保持
        nationalHolidayName: existingDay.nationalHolidayName, // 既存のnationalHolidayNameを保持
        classOrder: existingDay.classOrder, // 既存のclassOrderを保持
        updatedAt: Date.now(),
      });
    } else {
      // 新規レコードを作成
      const nextClassWeekday = normalizeClassWeekday(dayOfWeek, date);

      await ctx.db.insert("calendar_days", {
        calendarId,
        date,
        type,
        termId,
        classWeekday: nextClassWeekday,
        description: description ?? undefined,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

// クライアントから呼び出す単日日付更新ミューテーション
export const setCalendarDay = mutation({
  args: {
    calendarId: v.id("calendars"),
    date: v.string(),
    type: v.union(
      v.literal("未指定"),
      v.literal("授業日"),
      v.literal("試験日"),
      v.literal("予備日"),
      v.literal("休講日")
    ),
    termId: v.optional(v.id("calendar_terms")),
    classWeekday: v.optional(v.union(v.number(), v.null())), // 1..7 or null to clear
    description: v.optional(v.union(v.string(), v.null())),
    notificationReasons: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { calendarId, date, type, termId, classWeekday, description, notificationReasons }
  ) => {
    await upsertCalendarDay(ctx, {
      calendarId,
      date,
      type,
      termId,
      classWeekday,
      description,
      notificationReasons,
    });

    return null;
  },
});

export const setCalendarDaysBatch = mutation({
  args: {
    calendarId: v.id("calendars"),
    entries: v.array(
      v.object({
        date: v.string(),
        type: v.union(
          v.literal("未指定"),
          v.literal("授業日"),
          v.literal("試験日"),
          v.literal("予備日"),
          v.literal("休講日")
        ),
        termId: v.optional(v.id("calendar_terms")),
        classWeekday: v.optional(v.union(v.number(), v.null())),
        description: v.optional(v.union(v.string(), v.null())),
        notificationReasons: v.optional(v.union(v.string(), v.null())),
      }),
    ),
  },
  returns: v.object({ processed: v.number() }),
  handler: async (ctx, { calendarId, entries }) => {
    let processed = 0;
    for (const entry of entries) {
      await upsertCalendarDay(ctx, {
        calendarId,
        date: entry.date,
        type: entry.type,
        termId: entry.termId,
        classWeekday: entry.classWeekday,
        description: entry.description,
        notificationReasons: entry.notificationReasons,
      });
      processed += 1;
    }

    return { processed };
  },
});

const WEEKLY_HOLIDAY_TARGETS = {
  saturday: 6,
  sunday: 0,
} as const;

type WeeklyHolidayTarget = keyof typeof WEEKLY_HOLIDAY_TARGETS;

const toUtcDay = (dateIso: string) => {
  const parsed = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const jsDate = new Date(parsed);
  return jsDate.getUTCDay();
};

export const setWeeklyHoliday = mutation({
  args: {
    calendarId: v.id("calendars"),
    target: v.union(v.literal("saturday"), v.literal("sunday")),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, { calendarId, target }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) {
      throw new Error("指定されたカレンダーが見つかりません。");
    }

    const targetWeekday = WEEKLY_HOLIDAY_TARGETS[target as WeeklyHolidayTarget];
    const days = await ctx.db
      .query("calendar_days")
      .withIndex("by_calendar_date", (q) => q.eq("calendarId", calendarId))
      .collect();

    let updatedCount = 0;
    for (const day of days) {
      const jsDay = toUtcDay(day.date);
      if (jsDay === null || jsDay !== targetWeekday) {
        continue;
      }

      await ctx.db.patch(day._id, {
        type: "休講日",
        classWeekday: undefined,
        classOrder: undefined,
        updatedAt: Date.now(),
      });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

type CalendarDayMutationInput = {
  calendarId: Id<"calendars">;
  date: string;
  type: "未指定" | "授業日" | "試験日" | "予備日" | "休講日";
  termId?: Id<"calendar_terms">;
  classWeekday?: number | null;
  description?: string | null;
  notificationReasons?: string | null;
};

const upsertCalendarDay = async (ctx: MutationCtx, input: CalendarDayMutationInput) => {
  const { calendarId, date, type, termId, classWeekday, description, notificationReasons } = input;

  const existingDay = await ctx.db
    .query("calendar_days")
    .withIndex("by_calendar_date", (q) => q.eq("calendarId", calendarId).eq("date", date))
    .unique();

  const normalizedTermId = termId ?? undefined;
  const normalizedWeekday =
    typeof classWeekday === "number" && Number.isFinite(classWeekday) && classWeekday >= 1 && classWeekday <= 7
      ? Math.trunc(classWeekday)
      : undefined;
  const normalizedDescription =
    typeof description === "string" && description.trim().length > 0 ? description.trim() : undefined;
  const normalizedNotificationReasons =
    typeof notificationReasons === "string" && notificationReasons.trim().length > 0
      ? notificationReasons.trim()
      : undefined;
  const normalizedClassOrder = type === "授業日" ? existingDay?.classOrder ?? undefined : undefined;

  if (existingDay) {
    await ctx.db.patch(existingDay._id, {
      type,
      termId: normalizedTermId,
      classWeekday: type === "授業日" ? normalizedWeekday : undefined,
      description: normalizedDescription,
      notificationReasons: normalizedNotificationReasons,
      classOrder: normalizedClassOrder,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("calendar_days", {
      calendarId,
      date,
      type,
      termId: normalizedTermId,
      classWeekday: type === "授業日" ? normalizedWeekday : undefined,
      description: normalizedDescription,
      notificationReasons: normalizedNotificationReasons,
      classOrder: normalizedClassOrder,
      updatedAt: Date.now(),
    });
  }
};

// 授業回数(classOrder)を学期×授業曜日ごとに再計算
export const assignClassOrder = mutation({
  args: {
    calendarId: v.id("calendars"),
  },
  returns: v.object({
    updatedCount: v.number(),
    clearedCount: v.number(),
    skippedCount: v.number(),
  }),
  handler: async (ctx, { calendarId }) => {
    const [allDays, calendarTerms] = await Promise.all([
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_date", (q) => q.eq("calendarId", calendarId))
        .collect(),
      ctx.db
        .query("calendar_terms")
        .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
        .collect(),
    ]);

    const now = Date.now();
    let updatedCount = 0;
    let clearedCount = 0;
    let skippedCount = 0;

    const classTermIds = new Set<string>();
    const holidayTermIds = new Set<string>();
    const termHolidayFlags = new Map<string, number | undefined>();

    for (const term of calendarTerms) {
      const flag = typeof term.holidayFlag === "number" ? term.holidayFlag : undefined;
      const termId = term._id as string;
      termHolidayFlags.set(termId, flag);
      if (flag === 1) {
        holidayTermIds.add(termId);
      } else {
        classTermIds.add(termId);
      }
    }

    const dayByDate = new Map<string, CalendarDayDoc>();
    for (const day of allDays) {
      dayByDate.set(day.date, day);
    }

    const termFirstDates = new Map<string, string>();
    for (const day of allDays) {
      if (!day.termId) {
        continue;
      }
      const termId = day.termId as string;
      if (!classTermIds.has(termId)) {
        continue;
      }
      const current = termFirstDates.get(termId);
      if (!current || day.date.localeCompare(current) < 0) {
        termFirstDates.set(termId, day.date);
      }
    }

    for (const day of allDays) {
      if (typeof day.notificationReasons === "string" && day.notificationReasons.length > 0) {
        await ctx.db.patch(day._id, { notificationReasons: undefined, updatedAt: now });
        day.notificationReasons = undefined;
      }
    }

    type CalendarDayDoc = (typeof allDays)[number];
    type DayContext = {
      day: CalendarDayDoc;
      manualWeekday?: number;
      effectiveWeekday?: number;
      nextReasons: string | undefined;
      notificationChanged: boolean;
      notificationHandled: boolean;
    };

    const dayContexts: DayContext[] = allDays.map((day) => {
      let manualWeekday: number | undefined;
      if (typeof day.classWeekday === "number" && Number.isFinite(day.classWeekday)) {
        const truncated = Math.trunc(day.classWeekday);
        if (truncated >= 1 && truncated <= 7) {
          manualWeekday = truncated;
        }
      }

      const timestamp = Date.parse(`${day.date}T00:00:00Z`);
      const jsWeekday = Number.isNaN(timestamp) ? null : new Date(timestamp).getUTCDay();
      const derivedWeekday =
        jsWeekday === null ? deriveClassWeekday(day.date) : toMondayBasedWeekday(jsWeekday);
      const effectiveWeekday = manualWeekday ?? derivedWeekday;

      const isHoliday = day.isHoliday === true;
      const isClassOrExam = day.type === "授業日" || day.type === "試験日";
      const termIdString = day.termId ? (day.termId as string) : undefined;
      const isWithinInstructionTerm =
        termIdString !== undefined && classTermIds.has(termIdString);
      const holidayMismatch = isHoliday && isClassOrExam;
      const closureMismatch =
        isWithinInstructionTerm && day.type === "休講日" && !isHoliday && jsWeekday !== null && jsWeekday !== 0;
      const weekdayMismatch =
        isWithinInstructionTerm &&
        isClassOrExam &&
        manualWeekday !== undefined &&
        jsWeekday !== null &&
        manualWeekday !== toMondayBasedWeekday(jsWeekday);

      const reasons: number[] = [];
      if (holidayMismatch) {
        reasons.push(1);
      }
      if (closureMismatch) {
        reasons.push(2);
      }
      if (weekdayMismatch) {
        reasons.push(3);
      }

      if (isWithinInstructionTerm && termIdString) {
        const firstDate = termFirstDates.get(termIdString);
        if (firstDate === day.date) {
          reasons.push(4);
        } else {
          const currentFlag = termHolidayFlags.get(termIdString);

          let offset = 1;
          let prevTermId: string | undefined;
          let prevFlag: number | undefined;

          while (offset <= 7) {
            const previousDate = new Date(day.date);
            previousDate.setDate(previousDate.getDate() - offset);
            const prevIso = previousDate.toISOString().slice(0, 10);
            const prevDay = dayByDate.get(prevIso);

            if (!prevDay) {
              offset++;
              continue;
            }

            if (prevDay.termId) {
              prevTermId = prevDay.termId as string;
              prevFlag = termHolidayFlags.get(prevTermId);
              break;
            }

            offset++;
          }

          if (prevTermId && prevTermId !== termIdString && prevFlag === 1 && currentFlag !== 1) {
            reasons.push(4);
          }
        }
      }

      const nextReasons = reasons.length > 0 ? reasons.join(",") : undefined;
      const currentReasons =
        typeof day.notificationReasons === "string" && day.notificationReasons.length > 0
          ? day.notificationReasons
          : undefined;
      const notificationChanged = currentReasons !== nextReasons;

      return {
        day,
        manualWeekday,
        effectiveWeekday,
        nextReasons,
        notificationChanged,
        notificationHandled: false,
      };
    });

    // 学期×授業曜日ごとの授業日リストを構築
    const groupedClassDays = new Map<string, DayContext[]>();

    for (const context of dayContexts) {
      const { day, effectiveWeekday, notificationChanged, nextReasons } = context;

      if (day.type !== "授業日") {
        continue;
      }

      if (typeof effectiveWeekday !== "number" || effectiveWeekday < 1 || effectiveWeekday > 7) {
        skippedCount++;

        if (day.classOrder !== undefined || notificationChanged) {
          const patch: { classOrder?: number; notificationReasons?: string; updatedAt: number } = {
            updatedAt: now,
          };

          if (day.classOrder !== undefined) {
            patch.classOrder = undefined;
            clearedCount++;
          }

          if (notificationChanged) {
            patch.notificationReasons = nextReasons;
          }

          await ctx.db.patch(day._id, patch);
          context.notificationHandled = context.notificationHandled || notificationChanged;
          context.day.classOrder = patch.classOrder;
          context.day.notificationReasons = nextReasons;
        }

        continue;
      }

      const termKey = (context.day.termId as string | undefined) ?? "";
      const groupKey = `${termKey}#${effectiveWeekday}`;

      if (!groupedClassDays.has(groupKey)) {
        groupedClassDays.set(groupKey, []);
      }

      groupedClassDays.get(groupKey)!.push(context);
    }

    for (const contexts of groupedClassDays.values()) {
      // 日付順にソート（同日重複は挿入順で安定）
      contexts.sort((a, b) => a.day.date.localeCompare(b.day.date));

      for (let index = 0; index < contexts.length; index++) {
        const context = contexts[index];
        const { day, nextReasons, notificationChanged } = context;
        const expectedOrder = index + 1;
        const shouldUpdateClassOrder = day.classOrder !== expectedOrder;

        if (shouldUpdateClassOrder || notificationChanged) {
          await ctx.db.patch(day._id, {
            classOrder: expectedOrder,
            notificationReasons: nextReasons,
            updatedAt: now,
          });

          if (shouldUpdateClassOrder) {
            updatedCount++;
          }

          context.notificationHandled = context.notificationHandled || notificationChanged;
          context.day.classOrder = expectedOrder;
          context.day.notificationReasons = nextReasons;
        }
      }
    }

    // 授業日以外のclassOrderはクリアしつつ通知フラグも更新
    for (const context of dayContexts) {
      const { day, nextReasons, notificationChanged } = context;

      if (day.type === "授業日") {
        continue;
      }

      const patch: { classOrder?: number; notificationReasons?: string; updatedAt: number } = {
        updatedAt: now,
      };

      let shouldPatch = false;

      if (day.classOrder !== undefined) {
        patch.classOrder = undefined;
        clearedCount++;
        shouldPatch = true;
      }

      if (notificationChanged && !context.notificationHandled) {
        patch.notificationReasons = nextReasons;
        shouldPatch = true;
        context.notificationHandled = true;
      }

      if (shouldPatch) {
        await ctx.db.patch(day._id, patch);
        context.day.classOrder = patch.classOrder;
        context.day.notificationReasons = nextReasons;
      }
    }

    // 授業日でclassOrder変更がなかったが通知フラグのみ変わったケースを補完
    for (const context of dayContexts) {
      const { day, nextReasons, notificationChanged } = context;

      if (notificationChanged && !context.notificationHandled) {
        await ctx.db.patch(day._id, {
          notificationReasons: nextReasons,
          updatedAt: now,
        });

        context.notificationHandled = true;
        context.day.notificationReasons = nextReasons;
      }
    }

    return {
      updatedCount,
      clearedCount,
      skippedCount,
    };
  },
});

export const listTermAssignmentsInRange = query({
  args: {
    calendarId: v.id("calendars"),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.array(
    v.object({
      date: v.string(),
      termId: v.id("calendar_terms"),
      termName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { calendarId, startDate, endDate }) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return [];
    }

    const [days, terms] = await Promise.all([
      ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_date", (q) =>
          q.eq("calendarId", calendarId).gte("date", startDate).lte("date", endDate),
        )
        .collect(),
      ctx.db
        .query("calendar_terms")
        .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
        .collect(),
    ]);

    const termNameMap = new Map<string, string>();
    for (const term of terms) {
      const trimmed = term.name?.trim();
      if (trimmed) {
        termNameMap.set(term._id, trimmed);
      }
    }

    return days
      .filter((day): day is typeof day & { termId: Id<"calendar_terms"> } => Boolean(day.termId))
      .map((day) => {
        const resolvedTermId = day.termId as Id<"calendar_terms">;
        return {
          date: day.date,
          termId: resolvedTermId,
          termName: termNameMap.get(resolvedTermId) ?? undefined,
        };
      });
  },
});

// 期間一括変更ミューテーション（内部用）
export const updatePeriod = internalMutation({
  args: {
    calendarId: v.id("calendars"),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD
    type: v.union(
      v.literal("未指定"),
      v.literal("授業日"),
      v.literal("試験日"),
      v.literal("予備日"),
      v.literal("休講日")
    ),
    termId: v.optional(v.id("calendar_terms")),
  },
  returns: v.object({
    updatedCount: v.number(),
    dateRange: v.string(),
  }),
  handler: async (ctx, { calendarId, startDate, endDate, type, termId }) => {
    // 日付の妥当性チェック
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      throw new Error("開始日は終了日より前である必要があります");
    }
    
    let updatedCount = 0;
    const currentDate = new Date(start);
    
    // 開始日から終了日まで1日ずつ処理
    while (currentDate <= end) {
      const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD形式
      
      // 既存のレコードを検索
      const existingDay = await ctx.db
        .query("calendar_days")
        .withIndex("by_calendar_date", (q) => 
          q.eq("calendarId", calendarId).eq("date", dateString)
        )
        .unique();

      if (existingDay) {
        // 既存レコードを更新
        await ctx.db.patch(existingDay._id, {
          type,
          termId: termId !== undefined ? termId : existingDay.termId,
          description: existingDay.description, // 既存のdescriptionを保持
          isHoliday: existingDay.isHoliday, // 既存のisHolidayを保持
          nationalHolidayName: existingDay.nationalHolidayName, // 既存のnationalHolidayNameを保持
          classWeekday: normalizeClassWeekday(undefined, dateString, existingDay.classWeekday),
          classOrder: existingDay.classOrder, // 既存のclassOrderを保持
          updatedAt: Date.now(),
        });
      } else {
        // 新規レコードを作成
        await ctx.db.insert("calendar_days", {
          calendarId,
          date: dateString,
          type,
          termId,
          classWeekday: normalizeClassWeekday(undefined, dateString),
          updatedAt: Date.now(),
        });
      }
      
      updatedCount++;
      
      // 次の日に進む
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return {
      updatedCount,
      dateRange: `${startDate} から ${endDate}`,
    };
  },
});

// カレンダーの全日付データを取得
export const getCalendarDays = query({
  args: {
    calendarId: v.id("calendars"),
  },
  returns: v.array(v.object({
    _id: v.id("calendar_days"),
    _creationTime: v.number(),
    calendarId: v.id("calendars"),
    date: v.string(),
    type: v.union(
      v.literal("未指定"),
      v.literal("授業日"),
      v.literal("試験日"),
      v.literal("予備日"),
      v.literal("休講日")
    ),
    termId: v.optional(v.id("calendar_terms")),
    termName: v.optional(v.string()),
    description: v.optional(v.string()),
    isHoliday: v.optional(v.boolean()),
    nationalHolidayName: v.optional(v.string()),
    classWeekday: v.optional(v.number()),
    effectiveClassWeekday: v.number(),
    classOrder: v.optional(v.number()),
    notificationReasons: v.optional(v.string()),
    updatedAt: v.number(),
  })),
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

    const termNameMap = new Map<string, string>();
    for (const term of terms) {
      const trimmed = term.name?.trim();
      if (trimmed) {
        termNameMap.set(term._id, trimmed);
      }
    }

    return days.map((day) => {
      const manualWeekday =
        typeof day.classWeekday === "number" && Number.isFinite(day.classWeekday) && day.classWeekday >= 1 && day.classWeekday <= 7
          ? Math.trunc(day.classWeekday)
          : undefined;

      return {
        ...day,
        termId: day.termId ?? undefined,
        termName: day.termId ? termNameMap.get(day.termId) : undefined,
        classWeekday: manualWeekday,
        effectiveClassWeekday: normalizeClassWeekday(manualWeekday, day.date),
        notificationReasons:
          typeof day.notificationReasons === "string" && day.notificationReasons.length > 0
            ? day.notificationReasons
            : undefined,
      };
    });
  },
});
