import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";

const attachmentValidator = v.object({
  name: v.string(),
  type: v.string(),
  dataUrl: v.string(),
  size: v.optional(v.number()),
});

const messageEventInputValidator = v.object({
  eventType: v.literal("message"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  timestamp: v.number(),
  attachments: v.optional(v.array(attachmentValidator)),
});

const toolEventInputValidator = v.object({
  eventType: v.literal("tool"),
  toolName: v.string(),
  timestamp: v.number(),
  args: v.optional(v.any()),
  result: v.optional(v.string()),
  status: v.optional(v.union(v.literal("success"), v.literal("error"))),
});

const timelineEventInputValidator = v.union(
  messageEventInputValidator,
  toolEventInputValidator,
);

type SessionSummary = {
  _id: Id<"calendar_agent_sessions">;
  sessionKey: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  toolLogCount: number;
  lastMessagePreview: string | null;
};

type MessageEvent = {
  eventType: "message";
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  attachments?: Array<{
    name: string;
    type: string;
    dataUrl: string;
    size?: number;
  }>;
};

type ToolEvent = {
  eventType: "tool";
  toolName: string;
  timestamp: number;
  args?: unknown;
  result?: string;
  status?: "success" | "error";
};

type TimelineEvent = MessageEvent | ToolEvent;

type SessionDetail = {
  sessionKey: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  toolLogCount: number;
  lastMessagePreview: string | null;
  events: TimelineEvent[];
};

type SessionDoc = {
  _id: Id<"calendar_agent_sessions">;
  calendarId: Id<"calendars">;
  sessionKey: string;
  createdAt: number;
  updatedAt: number;
  lastEventPreview?: string;
  lastEventType?: "message" | "tool";
  messageCount?: number;
  toolLogCount?: number;
};

type EventDoc = {
  _id: Id<"calendar_agent_session_events">;
  calendarId: Id<"calendars">;
  sessionKey: string;
  eventType: "message" | "tool";
  role?: "user" | "assistant";
  content?: string;
  attachments?: MessageEvent["attachments"];
  toolName?: string;
  args?: unknown;
  result?: string;
  status?: "success" | "error";
  timestamp: number;
  createdAt: number;
};

const sanitizePreview = (text: string | undefined | null): string | undefined => {
  if (!text) {
    return undefined;
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, 120);
};

const mapEvent = (event: EventDoc): TimelineEvent => {
  if (event.eventType === "tool") {
    return {
      eventType: "tool",
      toolName: event.toolName ?? "",
      timestamp: event.timestamp,
      args: event.args,
      result: typeof event.result === "string" ? event.result : undefined,
      status: event.status,
    } satisfies ToolEvent;
  }

  return {
    eventType: "message",
    role: event.role === "assistant" ? "assistant" : "user",
    content: typeof event.content === "string" ? event.content : "",
    timestamp: event.timestamp,
    attachments: Array.isArray(event.attachments)
      ? event.attachments.map((attachment) => ({
          name: typeof attachment.name === "string" ? attachment.name : "image",
          type: typeof attachment.type === "string" ? attachment.type : "image/png",
          dataUrl: typeof attachment.dataUrl === "string" ? attachment.dataUrl : "",
          size:
            typeof attachment.size === "number" && Number.isFinite(attachment.size)
              ? attachment.size
              : undefined,
        }))
      : undefined,
  } satisfies MessageEvent;
};

const ensureSessionRecord = async (
  ctx: MutationCtx,
  calendarId: Id<"calendars">,
  sessionKey: string,
): Promise<SessionDoc> => {
  const existing = await ctx.db
    .query("calendar_agent_sessions")
    .withIndex("by_calendar_session", (q) => q.eq("calendarId", calendarId).eq("sessionKey", sessionKey))
    .unique();

  if (existing) {
    return existing as SessionDoc;
  }

  const now = Date.now();
  const insertedId = await ctx.db.insert("calendar_agent_sessions", {
    calendarId,
    sessionKey,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    toolLogCount: 0,
  });

  return {
    _id: insertedId,
    calendarId,
    sessionKey,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    toolLogCount: 0,
    lastEventPreview: undefined,
    lastEventType: undefined,
  } satisfies SessionDoc;
};

export const listSessions = query({
  args: {
    calendarId: v.id("calendars"),
  },
  handler: async (ctx, { calendarId }): Promise<SessionSummary[]> => {
    const sessions = await ctx.db
      .query("calendar_agent_sessions")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    const sorted = sessions.sort((a, b) => b.updatedAt - a.updatedAt);

    return sorted.map((session) => ({
      _id: session._id,
      sessionKey: session.sessionKey,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: typeof session.messageCount === "number" ? session.messageCount : 0,
      toolLogCount: typeof session.toolLogCount === "number" ? session.toolLogCount : 0,
      lastMessagePreview:
        session.lastEventType === "message"
          ? sanitizePreview(session.lastEventPreview) ?? null
          : null,
    }));
  },
});

export const getSession = query({
  args: {
    calendarId: v.id("calendars"),
    sessionKey: v.string(),
  },
  handler: async (ctx, { calendarId, sessionKey }): Promise<SessionDetail | null> => {
    const session = await ctx.db
      .query("calendar_agent_sessions")
      .withIndex("by_calendar_session", (q) => q.eq("calendarId", calendarId).eq("sessionKey", sessionKey))
      .unique();

    if (!session) {
      return null;
    }

    const events = await ctx.db
      .query("calendar_agent_session_events")
      .withIndex("by_session", (q) => q.eq("calendarId", calendarId).eq("sessionKey", sessionKey))
      .collect();

    const sortedEvents = events.sort((a, b) => a.createdAt - b.createdAt).map((event) => mapEvent(event as EventDoc));

    return {
      sessionKey: session.sessionKey,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: typeof session.messageCount === "number" ? session.messageCount : 0,
      toolLogCount: typeof session.toolLogCount === "number" ? session.toolLogCount : 0,
      lastMessagePreview:
        session.lastEventType === "message"
          ? sanitizePreview(session.lastEventPreview) ?? null
          : null,
      events: sortedEvents,
    } satisfies SessionDetail;
  },
});

export const getLatestSession = query({
  args: {
    calendarId: v.id("calendars"),
  },
  handler: async (ctx, { calendarId }): Promise<SessionDetail | null> => {
    const sessions = await ctx.db
      .query("calendar_agent_sessions")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    if (sessions.length === 0) {
      return null;
    }

    const latest = sessions.reduce((current, candidate) => {
      if (!current) {
        return candidate;
      }
      return candidate.updatedAt > current.updatedAt ? candidate : current;
    });

    const events = await ctx.db
      .query("calendar_agent_session_events")
      .withIndex("by_session", (q) => q.eq("calendarId", calendarId).eq("sessionKey", latest.sessionKey))
      .collect();

    const sortedEvents = events.sort((a, b) => a.createdAt - b.createdAt).map((event) => mapEvent(event as EventDoc));

    return {
      sessionKey: latest.sessionKey,
      createdAt: latest.createdAt,
      updatedAt: latest.updatedAt,
      messageCount: typeof latest.messageCount === "number" ? latest.messageCount : 0,
      toolLogCount: typeof latest.toolLogCount === "number" ? latest.toolLogCount : 0,
      lastMessagePreview:
        latest.lastEventType === "message"
          ? sanitizePreview(latest.lastEventPreview) ?? null
          : null,
      events: sortedEvents,
    } satisfies SessionDetail;
  },
});

const buildEventInsert = (
  calendarId: Id<"calendars">,
  sessionKey: string,
  event: Infer<typeof timelineEventInputValidator>,
) => {
  const timestamp = Number.isFinite(event.timestamp) ? event.timestamp : Date.now();
  const createdAt = Date.now();

  if (event.eventType === "tool") {
    return {
      calendarId,
      sessionKey,
      eventType: "tool" as const,
      toolName: event.toolName,
      args: event.args,
      result: event.result,
      status: event.status,
      timestamp,
      createdAt,
    } satisfies Omit<EventDoc, "_id">;
  }

  return {
    calendarId,
    sessionKey,
    eventType: "message" as const,
    role: event.role,
    content: event.content,
    attachments: event.attachments,
    timestamp,
    createdAt,
  } satisfies Omit<EventDoc, "_id">;
};

const persistEvents = async (
  ctx: MutationCtx,
  calendarId: Id<"calendars">,
  sessionKey: string,
  events: Infer<typeof timelineEventInputValidator>[],
  existingSession?: SessionDoc,
) => {
  if (events.length === 0) {
    return { session: existingSession, insertedCount: 0 } as const;
  }

  const session = existingSession ?? (await ensureSessionRecord(ctx, calendarId, sessionKey));

  let messageCount = typeof session.messageCount === "number" ? session.messageCount : 0;
  let toolLogCount = typeof session.toolLogCount === "number" ? session.toolLogCount : 0;
  let lastEventPreview = session.lastEventPreview;
  let lastEventType = session.lastEventType;
  let latestTimestamp = session.updatedAt;

  for (const event of events) {
    const insertable = buildEventInsert(calendarId, sessionKey, event);
    await ctx.db.insert("calendar_agent_session_events", insertable);

    const timestamp = Number.isFinite(event.timestamp) ? event.timestamp : Date.now();
    latestTimestamp = Math.max(latestTimestamp, timestamp);

    if (event.eventType === "message") {
      messageCount += 1;
      lastEventType = "message";
      const preview = sanitizePreview(event.content);
      lastEventPreview = preview ?? lastEventPreview;
    } else {
      toolLogCount += 1;
      lastEventType = "tool";
      const preview = sanitizePreview(event.toolName);
      lastEventPreview = preview ?? lastEventPreview;
    }
  }

  await ctx.db.patch(session._id, {
    updatedAt: latestTimestamp,
    messageCount,
    toolLogCount,
    lastEventType,
    lastEventPreview,
  });

  return { session, insertedCount: events.length } as const;
};

export const appendEvents = mutation({
  args: {
    calendarId: v.id("calendars"),
    sessionKey: v.string(),
    events: v.array(timelineEventInputValidator),
  },
  handler: async (ctx, { calendarId, sessionKey, events }) => {
    const { insertedCount } = await persistEvents(ctx, calendarId, sessionKey, events);

    return { insertedCount } satisfies { insertedCount: number };
  },
});

export const replaceSession = mutation({
  args: {
    calendarId: v.id("calendars"),
    sessionKey: v.string(),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        timestamp: v.optional(v.number()),
        attachments: v.optional(v.array(attachmentValidator)),
      }),
    ),
    toolLogs: v.optional(
      v.array(
        v.object({
          toolName: v.string(),
          args: v.any(),
          result: v.optional(v.string()),
          status: v.optional(v.union(v.literal("success"), v.literal("error"))),
          timestamp: v.optional(v.number()),
        }),
      ),
    ),
  },
  handler: async (ctx, { calendarId, sessionKey, messages, toolLogs = [] }) => {
    const session = await ensureSessionRecord(ctx, calendarId, sessionKey);

    const existingEvents = await ctx.db
      .query("calendar_agent_session_events")
      .withIndex("by_session", (q) => q.eq("calendarId", calendarId).eq("sessionKey", sessionKey))
      .collect();

    await Promise.all(existingEvents.map((event) => ctx.db.delete(event._id)));

    const eventsToInsert: Infer<typeof timelineEventInputValidator>[] = [];

    const safeMessages = messages.map((message) => ({
      eventType: "message" as const,
      role: message.role,
      content: message.content,
      timestamp:
        typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
          ? message.timestamp
          : Date.now(),
      attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
    }));

    const safeToolLogs = toolLogs.map((log) => ({
      eventType: "tool" as const,
      toolName: log.toolName,
      args: log.args,
      result: typeof log.result === "string" ? log.result : undefined,
      status:
        log.status === "success" || log.status === "error"
          ? log.status
          : undefined,
      timestamp:
        typeof log.timestamp === "number" && Number.isFinite(log.timestamp)
          ? log.timestamp
          : Date.now(),
    }));

    eventsToInsert.push(...safeMessages, ...safeToolLogs);

    eventsToInsert.sort((a, b) => a.timestamp - b.timestamp);

    if (eventsToInsert.length > 0) {
      await persistEvents(ctx, calendarId, sessionKey, eventsToInsert, session);
    } else {
      await ctx.db.patch(session._id, {
        updatedAt: Date.now(),
        messageCount: 0,
        toolLogCount: 0,
        lastEventPreview: undefined,
        lastEventType: undefined,
      });
    }

    return { eventCount: eventsToInsert.length } satisfies { eventCount: number };
  },
});

export const listEvents = query({
  args: {
    calendarId: v.id("calendars"),
    sessionKey: v.string(),
  },
  handler: async (ctx, { calendarId, sessionKey }): Promise<TimelineEvent[]> => {
    const events = await ctx.db
      .query("calendar_agent_session_events")
      .withIndex("by_session", (q) => q.eq("calendarId", calendarId).eq("sessionKey", sessionKey))
      .collect();

    return events.sort((a, b) => a.createdAt - b.createdAt).map((event) => mapEvent(event as EventDoc));
  },
});

export const deleteSessionsForCalendar = mutation({
  args: {
    calendarId: v.id("calendars"),
  },
  handler: async (ctx, { calendarId }) => {
    const sessions = await ctx.db
      .query("calendar_agent_sessions")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    const events = await ctx.db
      .query("calendar_agent_session_events")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendarId))
      .collect();

    await Promise.all(events.map((event) => ctx.db.delete(event._id)));
    await Promise.all(sessions.map((session) => ctx.db.delete(session._id)));

    return {
      deletedSessionCount: sessions.length,
      deletedEventCount: events.length,
    } satisfies { deletedSessionCount: number; deletedEventCount: number };
  },
});
