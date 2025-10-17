import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const DayType = v.union(
  v.literal("未指定"),
  v.literal("授業日"),
  v.literal("試験日"),
  v.literal("予備日"),
  v.literal("休講日")
);

export default defineSchema({
  calendars: defineTable({
    name: v.string(),
    fiscalYear: v.number(),
    universityCode: v.optional(v.string()),
    fiscalStart: v.string(), // YYYY-MM-DD
    fiscalEnd: v.string(), // YYYY-MM-DD
    createdAt: v.number(),
    updatedAt: v.number(),
    downloadCount: v.optional(v.number()),
    creatorId: v.optional(v.string()),
    isPublishable: v.optional(v.boolean()),
    memo: v.optional(v.string()),
    inputInformation: v.optional(v.string()),
    disableSaturday: v.optional(v.boolean()),
  })
    .index("by_year_name", ["fiscalYear", "name"])
    .index("by_year", ["fiscalYear"])
    .index("by_university_year", ["universityCode", "fiscalYear"])
    .index("by_university_year_name", ["universityCode", "fiscalYear", "name"])
    .index("by_year_download", ["fiscalYear", "downloadCount"]),

  calendar_days: defineTable({
    calendarId: v.id("calendars"),
    date: v.string(), // YYYY-MM-DD
    type: DayType,
    termId: v.optional(v.id("calendar_terms")),
    description: v.optional(v.string()),
    isHoliday: v.optional(v.boolean()),
    nationalHolidayName: v.optional(v.string()),
    classWeekday: v.optional(v.number()), // 1..7
    classOrder: v.optional(v.number()), // その学期×曜日での何回目の授業か（1始まり）
    notificationReasons: v.optional(v.string()), // 通知理由コード（"1,3"など）
    updatedAt: v.number(),
  })
    .index("by_calendar_date", ["calendarId", "date"])
    .index("by_calendar_type", ["calendarId", "type"]),

  holiday_cache: defineTable({
    fiscalYear: v.number(),
    holidays: v.array(
      v.object({
        date: v.string(), // YYYY-MM-DD
        name: v.string(),
      })
    ),
    fetchedAt: v.number(),
  }).index("by_year", ["fiscalYear"]),

  calendar_terms: defineTable({
    calendarId: v.id("calendars"),
    name: v.string(),
    order: v.optional(v.number()),
    shortName: v.optional(v.string()),
    classCount: v.optional(v.number()),
    holidayFlag: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_calendar", ["calendarId"])
    .index("by_calendar_name", ["calendarId", "name"]),

  class_time_sets: defineTable({
    name: v.string(),
    universityCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityCode"])
    .index("by_university_name", ["universityCode", "name"]),

  class_time_periods: defineTable({
    classTimeSetId: v.id("class_time_sets"),
    period: v.number(),
    start: v.string(), // HH:MM
    end: v.string(), // HH:MM
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_set_period", ["classTimeSetId", "period"])
    .index("by_set", ["classTimeSetId"]),

  // 大学マスタ
  universities: defineTable({
    code: v.string(),
    name: v.string(),
    prefecture: v.optional(v.string()),
    type: v.optional(v.union(v.literal("国立"), v.literal("公立"), v.literal("私立"))),
    capacity: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_name", ["name"]),

  university_campuses: defineTable({
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityCode"])
    .index("by_university_campus", ["universityCode", "campusName"]),

  university_research_records: defineTable({
    universityId: v.id("universities"),
    universityCode: v.string(),
    universityName: v.string(),
    fiscalYear: v.number(),
    termScheme: v.optional(v.string()),
    termSchemeSources: v.optional(v.string()),
    classTimeAndCount: v.optional(v.string()),
    classTimeAndCountSources: v.optional(v.string()),
    academicCalendarLinks: v.optional(v.string()),
    academicCalendarLinksSources: v.optional(v.string()),
    informationSources: v.optional(v.string()),
    finalOutput: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university_year", ["universityId", "fiscalYear"])
    .index("by_fiscal_year", ["fiscalYear"])
    .index("by_updated_at", ["updatedAt"]),

  calendar_agent_sessions: defineTable({
    calendarId: v.id("calendars"),
    sessionKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastEventPreview: v.optional(v.string()),
    lastEventType: v.optional(v.union(v.literal("message"), v.literal("tool"))),
    messageCount: v.optional(v.number()),
    toolLogCount: v.optional(v.number()),
  })
    .index("by_calendar", ["calendarId"])
    .index("by_calendar_session", ["calendarId", "sessionKey"]),

  calendar_agent_session_events: defineTable({
    calendarId: v.id("calendars"),
    sessionKey: v.string(),
    eventType: v.union(v.literal("message"), v.literal("tool")),
    role: v.optional(v.union(v.literal("user"), v.literal("assistant"))),
    content: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          name: v.string(),
          type: v.string(),
          dataUrl: v.string(),
          size: v.optional(v.number()),
        }),
      ),
    ),
    toolName: v.optional(v.string()),
    args: v.optional(v.any()),
    result: v.optional(v.string()),
    status: v.optional(v.union(v.literal("success"), v.literal("error"))),
    timestamp: v.number(),
    createdAt: v.number(),
  })
    .index("by_calendar", ["calendarId"])
    .index("by_session", ["calendarId", "sessionKey", "createdAt"]),

});
