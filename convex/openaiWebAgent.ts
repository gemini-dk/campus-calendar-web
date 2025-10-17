"use node";

import { Agent, tool, webSearchTool, run, AgentInputItem, user, assistant } from '@openai/agents';
import type { AgentOutputType, RunResult } from '@openai/agents';
import { z } from 'zod';
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { fetchFiscalHolidays, type FiscalHoliday } from "../src/lib/holidays";
import { createPrompt as createPromptV2 } from "../src/lib/createPromptV2";
import type { Id } from "./_generated/dataModel";

type ToolCallLogEntry = {
  toolName: string;
  args: unknown;
  result?: string;
  status?: 'success' | 'error';
  timestamp: number;
};

type AgentToolContext = Pick<ActionCtx, "runMutation" | "runQuery"> & {
  calendarId?: Id<"calendars">;
  allowedTermNames?: string[];
  terms?: CalendarTermListEntry[];
  logCollector?: (entry: ToolCallLogEntry) => void | Promise<void>;
};

type ImageAttachmentPayload = {
  name: string;
  type: string;
  dataUrl: string;
  size?: number;
};

type ProcessMessageHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ImageAttachmentPayload[];
  timestamp?: number;
};

type ProcessMessageResult = {
  response: string;
  sessionId: string;
  history: ProcessMessageHistoryEntry[];
  toolCalls?: Array<{ toolName: string; args: unknown; result?: string }>;
  toolLogs?: ToolCallLogEntry[];
};

type CalendarTermListEntry = {
  _id: Id<"calendar_terms">;
  name: string;
  order?: number;
  shortName?: string;
  classCount?: number;
  holidayFlag?: 1 | 2;
};

type TermSummaryRecord = {
  termId?: Id<"calendar_terms">;
  termName: string;
  weekdayCounts: number[];
};

type CalendarSummaryRecord = {
  termSummaries: TermSummaryRecord[];
  vacationSummaries: { key: string; label: string; count: number }[];
};

type TermAssignmentRecord = {
  date: string;
  termId: Id<"calendar_terms">;
  termName?: string;
};

type TermWeekdayDetailRecord = {
  date: string;
  type: string;
  termId?: Id<"calendar_terms">;
  termName?: string;
  calendarWeekday: string;
  assignedWeekday: string;
  classWeekday?: number;
  classOrder?: number;
  notificationReasons?: string;
};

type AgentModelId = 'gpt-5-mini' | 'gpt-5' | 'gpt-4.1';

type AgentUserContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image: string | { id: string } };

const DEFAULT_AGENT_MODEL: AgentModelId = 'gpt-5-mini';
const ALLOWED_AGENT_MODELS: AgentModelId[] = ['gpt-5-mini', 'gpt-5', 'gpt-4.1'];

const isAgentModelId = (value: string): value is AgentModelId => {
  return ALLOWED_AGENT_MODELS.includes(value as AgentModelId);
};

const sanitizeAttachmentPayload = (input: unknown): ImageAttachmentPayload | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const { name, type, dataUrl, size } = input as Partial<ImageAttachmentPayload> & {
    dataUrl?: unknown;
  };

  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return null;
  }

  const safeName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'image';
  const safeType = typeof type === 'string' && type.startsWith('image/') ? type : 'image/png';
  const safeSize = typeof size === 'number' && Number.isFinite(size) ? size : undefined;

  return {
    name: safeName,
    type: safeType,
    dataUrl,
    size: safeSize,
  } satisfies ImageAttachmentPayload;
};

const sanitizeAttachmentPayloadArray = (input: unknown): ImageAttachmentPayload[] | undefined => {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const sanitized = input
    .map((item) => sanitizeAttachmentPayload(item))
    .filter((item): item is ImageAttachmentPayload => item !== null);

  return sanitized.length > 0 ? sanitized : undefined;
};

const buildUserContentItems = (
  content: string,
  attachments?: ImageAttachmentPayload[],
): AgentUserContent[] => {
  const items: AgentUserContent[] = [];
  if (content.trim().length > 0) {
    items.push({ type: 'input_text', text: content });
  }

  attachments?.forEach((attachment) => {
    items.push({ type: 'input_image', image: attachment.dataUrl });
  });

  if (items.length === 0) {
    items.push({ type: 'input_text', text: '画像を添付しました。' });
  }

  return items;
};

const extractActionContext = (context: unknown): Partial<AgentToolContext> | null => {
  if (!context || typeof context !== "object") {
    return null;
  }

  if ("context" in context && typeof (context as { context?: unknown }).context === "object") {
    return extractActionContext((context as { context?: unknown }).context);
  }

  return context as Partial<AgentToolContext>;
};

const getToolContext = (context: unknown): AgentToolContext | null => {
  const toolContext = extractActionContext(context);

  if (!toolContext || typeof toolContext.runMutation !== "function" || typeof toolContext.runQuery !== "function") {
    return null;
  }

  return toolContext as AgentToolContext;
};

const UNASSIGNED_TERM_NAME = "未分類";

const formatAsMonthDay = (isoDate: string): string => {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${month}/${day}`;
};

const logToolCall = (
  toolName: string,
  params: unknown,
  context?: unknown,
  result?: string,
  status?: 'success' | 'error',
): void => {
  try {
    console.log(`[tool:${toolName}] ${JSON.stringify(params)}`);
  } catch (error) {
    console.log(`[tool:${toolName}] パラメータのログ出力に失敗しました: ${error}`);
  }

  if (!context) {
    return;
  }

  try {
    const toolContext = getToolContext(context);
    if (toolContext?.logCollector) {
      const maybePromise = toolContext.logCollector({
        toolName,
        args: params,
        result,
        status,
        timestamp: Date.now(),
      });

      if (maybePromise && typeof (maybePromise as PromiseLike<void>).then === "function") {
        (maybePromise as PromiseLike<void>).then(undefined, (logError) => {
          console.error("ツールログの記録に失敗しました:", logError);
        });
      }
    }
  } catch (error) {
    console.error('ツールログの収集に失敗しました:', error);
  }
};

const lookupTermId = async (
  toolContext: AgentToolContext,
  calendarId: Id<"calendars">,
  rawTermName?: string | null,
): Promise<Id<"calendar_terms"> | undefined> => {
  const termName = typeof rawTermName === "string" ? rawTermName.trim() : "";
  if (termName.length === 0 || termName === UNASSIGNED_TERM_NAME) {
    return undefined;
  }

  const existingTerms = (await toolContext.runQuery(api.calendarTerms.listTerms, {
    calendarId,
  })) as CalendarTermListEntry[];

  const matched = existingTerms.find((term) => term.name === termName);
  return matched?._id;
};

const resolveTermId = async (
  toolContext: AgentToolContext,
  calendarId: Id<"calendars">,
  rawTermName?: string | null,
): Promise<Id<"calendar_terms"> | undefined> => {
  const existing = await lookupTermId(toolContext, calendarId, rawTermName);
  if (existing) {
    return existing;
  }

  const termName = typeof rawTermName === "string" ? rawTermName.trim() : "";
  if (termName.length === 0 || termName === UNASSIGNED_TERM_NAME) {
    return undefined;
  }

  const inserted = await toolContext.runMutation(api.calendarTerms.addTerm, {
    calendarId,
    termName,
  });

  return inserted.term._id;
};

// 自作ツール（Function tools）の定義

// 簡単なメモリ保存ツール（デモ用）
const memoTool = tool({
  name: 'save_memo',
  description: 'メモを一時的に保存します（セッション内のみ有効）',
  parameters: z.object({
    content: z.string().describe('保存するメモの内容'),
  }),
  async execute({ content }, context) {
    const response = `メモを保存しました: "${content}"`;
    logToolCall('save_memo', { content }, context, response, 'success');
    // 実際にはセッション内のメモリに保存（デモ用）
    return response;
  },
});

// 日付詳細更新ツール（カレンダー操作）
const updateDayDetailTool = tool({
  name: 'update_day_type',
  description: '学期内の任意の日付についてタイプを設定・変更します。カレンダーと異なる場合はできる限りdescriptionも設定してください',
  parameters: z.object({
    date: z.string().describe('日付（YYYY-MM-DD形式、例：2024-04-01）'),
    type: z.enum(['授業日', '試験日', '予備日', '休講日']).describe('日付のタイプ'),
    weekday: z.enum(['日', '月', '火', '水', '木', '金', '土']).nullable().optional().describe('授業日として扱う曜日（日、月、火、水、木、金、土）'),
    description: z.string().nullable().optional().describe('一般的なカレンダーと異なる場合の理由（任意）ex.「創立記念日のため休講」「学園祭準備期間のため休講」「5月3日の振替授業日」「特別授業日」など。'),
  }),
  async execute({ date, type, weekday, description }, context) {
    try {
      const toolContext = getToolContext(context);
      if (!toolContext) {
        console.log('Convex context is not available in tool execution context');
        return '内部エラーが発生しました。もう一度お試しください。';
      }

      const calendarId = toolContext.calendarId;

      console.log('Calendar ID from context:', calendarId);

      if (!calendarId) {
        console.log('No calendar ID found in context');
        return 'カレンダーが選択されていません。左側のプルダウンでカレンダーを選択してください。';
      }

      const normalizedDescription = typeof description === 'string'
        ? description.trim()
        : undefined;
      const descriptionForMutation = description === undefined
        ? undefined
        : description === null
          ? null
          : normalizedDescription && normalizedDescription.length > 0
            ? normalizedDescription
            : null;

      // 曜日を数値に変換（月=1, ..., 日=7）
      let dayOfWeekNumber: number | undefined;
      if (weekday) {
        const dayMap: Record<string, number> = {
          '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 7
        };
        dayOfWeekNumber = dayMap[weekday];
      }

      await toolContext.runMutation(internal.calendarDayTools.updateDayTypeExtended, {
        calendarId,
        date,
        type,
        dayOfWeek: dayOfWeekNumber,
        description: descriptionForMutation === undefined ? undefined : descriptionForMutation,
      });

      let result = `${date}を「${type}」に変更しました。`;
      if (weekday) result += ` 授業曜日: ${weekday}`;
      if (typeof normalizedDescription === 'string' && normalizedDescription.length > 0) {
        result += ` 説明: ${normalizedDescription}`;
      }
      if (description === null || normalizedDescription === '') {
        result += ' 説明を削除しました。';
      }
      result += ' カレンダー画面に反映されます。';

      logToolCall('update_day_type', { date, type, weekday, description }, context, result, 'success');
      return result;
    } catch (error) {
      console.error('Tool execution error:', error);
      const errorMessage = `日付タイプの変更に失敗しました: ${error instanceof Error ? error.message : error}`;
      logToolCall('update_day_type', { date, type, weekday, description }, context, errorMessage, 'error');
      return errorMessage;
    }

  },
});

// 長期休暇設定ツール（カレンダー操作）
const setLongVacationPeriodTool = tool({
  name: 'set_long_vacation_period',
  description: '春休みなどの長期休暇期間を休講日として一括登録します',
  parameters: z.object({
    startDate: z.string().describe('開始日（YYYY-MM-DD形式、例：2024-04-01）'),
    endDate: z.string().describe('終了日（YYYY-MM-DD形式、例：2024-04-30）'),
    vacationType: z.enum(['春休み', '夏休み', '冬休み']).describe('設定したい休暇種別（春休み、夏休み、冬休み）'),
  }),
  async execute({ startDate, endDate, vacationType }, context): Promise<string> {
    try {
      const toolContext = getToolContext(context);
      if (!toolContext) {
        console.log('Convex context is not available in period update tool');
        return '内部エラーが発生しました。もう一度お試しください。';
      }

      const calendarId = toolContext.calendarId;

      if (!calendarId) {
        console.log('No calendar ID found in context');
        return 'カレンダーが選択されていません。左側のプルダウンでカレンダーを選択してください。';
      }

      const allowedTermNames: string[] = Array.isArray(toolContext.allowedTermNames)
        ? toolContext.allowedTermNames
        : [];
      const allowedNameSet = new Set(
        allowedTermNames
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      );

      if (allowedNameSet.size > 0 && !allowedNameSet.has(vacationType)) {
        const allowedMessage = allowedTermNames.length > 0
          ? allowedTermNames.join('、')
          : '（期間名は使用できません）';
        return `期間名「${vacationType}」は使用できません。使用できる期間名: ${allowedMessage}`;
      }

      const termId = await resolveTermId(toolContext, calendarId, vacationType);

      // 日付の妥当性チェック
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return '日付の形式が正しくありません。YYYY-MM-DD形式で入力してください。';
      }

      if (start > end) {
        return '開始日は終了日より前である必要があります。';
      }

      const existingAssignments = (await toolContext.runQuery(
        api.calendarDayTools.listTermAssignmentsInRange,
        {
          calendarId,
          startDate,
          endDate,
        },
      )) as TermAssignmentRecord[];

      const conflictingDates = existingAssignments
        .filter((assignment) => assignment.termId !== termId)
        .map((assignment) => assignment.date);

      const result: { updatedCount: number; dateRange: string } = await toolContext.runMutation(
        internal.calendarDayTools.updatePeriod,
        {
          calendarId,
          startDate,
          endDate,
          type: '休講日',
          termId,
        },
      );

      let response: string = `${result.dateRange}の期間（${result.updatedCount}日間）を「休講日」として登録しました。 期間名: ${vacationType}`;
      response += ' カレンダー画面に反映されます。';

      if (conflictingDates.length > 0) {
        const formattedDates = conflictingDates.map((iso) => formatAsMonthDay(iso)).join(',');
        response += ` ${formattedDates}に異なる期間の設定がありましたが上書き更新しています。`;
      }

      logToolCall(
        'set_long_vacation_period',
        { startDate, endDate, vacationType },
        context,
        response,
        'success',
      );
      return response;
    } catch (error) {
      console.error('Period update tool execution error:', error);
      const errorMessage = `期間一括変更に失敗しました: ${error instanceof Error ? error.message : error}`;
      logToolCall('set_long_vacation_period', { startDate, endDate, vacationType }, context, errorMessage, 'error');
      return errorMessage;
    }
  },
});

// 学期期間設定ツール（カレンダー操作）
const setTermPeriodTool = tool({
  name: 'set_term_period',
  description: '前期・第1クォーターなどの学期を設定します。期間内の日程は全て授業日として登録されるため、休講日などは変更が必要です。',
  parameters: z.object({
    startDate: z.string().describe('開始日（YYYY-MM-DD形式、例：2024-04-01）'),
    endDate: z.string().describe('終了日（YYYY-MM-DD形式、例：2024-07-31）'),
    termName: z.string().describe('設定したい学期名（例：前期、後期、1Q、2Qなど）'),
  }),
  async execute({ startDate, endDate, termName }, context): Promise<string> {
    try {
      const toolContext = getToolContext(context);
      if (!toolContext) {
        return '内部エラーが発生しました。もう一度お試しください。';
      }

      const calendarId = toolContext.calendarId;

      if (!calendarId) {
        return 'カレンダーが選択されていません。左側のプルダウンでカレンダーを選択してください。';
      }

      const normalizedTermName = termName.trim();
      if (!normalizedTermName) {
        return '学期名を入力してください。';
      }

      const allowedTermNames: string[] = Array.isArray(toolContext.allowedTermNames)
        ? toolContext.allowedTermNames
        : [];
      const allowedNameSet = new Set(
        allowedTermNames
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      );

      if (
        allowedNameSet.size > 0 &&
        !allowedNameSet.has(normalizedTermName) &&
        normalizedTermName !== UNASSIGNED_TERM_NAME
      ) {
        const allowedMessage = allowedTermNames.length > 0
          ? allowedTermNames.join('、')
          : '（期間名は使用できません）';
        return `期間名「${normalizedTermName}」は使用できません。使用できる期間名: ${allowedMessage}`;
      }

      const termId = await resolveTermId(toolContext, calendarId, normalizedTermName);

      // 日付の妥当性チェック
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return '日付の形式が正しくありません。YYYY-MM-DD形式で入力してください。';
      }

      if (start > end) {
        return '開始日は終了日より前である必要があります。';
      }

      const existingAssignments = (await toolContext.runQuery(
        api.calendarDayTools.listTermAssignmentsInRange,
        {
          calendarId,
          startDate,
          endDate,
        },
      )) as TermAssignmentRecord[];

      const conflictingDates = existingAssignments
        .filter((assignment) => (termId ? assignment.termId !== termId : true))
        .map((assignment) => assignment.date);

//      const defaultType = normalizedTermName.includes('試験') ? '試験日' : '授業日';

      const result: { updatedCount: number; dateRange: string } = await toolContext.runMutation(
        internal.calendarDayTools.updatePeriod,
        {
          calendarId,
          startDate,
          endDate,
          type: '授業日',
          termId,
        },
      );

      let response = `${result.dateRange}の期間（${result.updatedCount}日間）を「授業日」として登録しました。 期間名: ${normalizedTermName}`;
      response += ' 授業日以外のタイプについて変更が必要です。';

      if (conflictingDates.length > 0) {
        const formattedDates = conflictingDates.map((iso) => formatAsMonthDay(iso)).join(',');
        response += ` ${formattedDates}に異なる期間の設定がありましたが上書き更新しています。`;
      }

      logToolCall('set_term_period', { startDate, endDate, termName }, context, response, 'success');
      return response;
    } catch (error) {
      console.error('Term period tool execution error:', error);
      const errorMessage = `期間一括変更に失敗しました: ${error instanceof Error ? error.message : error}`;
      logToolCall('set_term_period', { startDate, endDate, termName }, context, errorMessage, 'error');
      return errorMessage;
    }
  },
});

// 試験期間設定ツール（カレンダー操作）
const setExamPeriodTool = tool({
  name: 'set_exam_period',
  description:
    '指定した試験期間を試験日として一括登録します。期間名には学期名を指定してください。学期期間として登録した後に日付タイプを試験日に変更する方法でも同じ結果になりますが、このツールなら一度で登録できます。',
  parameters: z.object({
    startDate: z.string().describe('開始日（YYYY-MM-DD形式、例：2024-07-01）'),
    endDate: z.string().describe('終了日（YYYY-MM-DD形式、例：2024-07-15）'),
    termName: z.string().describe('試験期間として登録したい学期名（例：前期、後期、1Qなど）。授業期間と同じ名称を指定してください。'),
  }),
  async execute({ startDate, endDate, termName }, context): Promise<string> {
    try {
      const toolContext = getToolContext(context);
      if (!toolContext) {
        return '内部エラーが発生しました。もう一度お試しください。';
      }

      const calendarId = toolContext.calendarId;

      if (!calendarId) {
        return 'カレンダーが選択されていません。左側のプルダウンでカレンダーを選択してください。';
      }

      const normalizedTermName = termName.trim();
      if (!normalizedTermName) {
        return '試験期間名（学期名）を入力してください。';
      }

      const allowedTermNames: string[] = Array.isArray(toolContext.allowedTermNames)
        ? toolContext.allowedTermNames
        : [];
      const allowedNameSet = new Set(
        allowedTermNames
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      );

      if (
        allowedNameSet.size > 0 &&
        !allowedNameSet.has(normalizedTermName) &&
        normalizedTermName !== UNASSIGNED_TERM_NAME
      ) {
        const allowedMessage = allowedTermNames.length > 0
          ? allowedTermNames.join('、')
          : '（期間名は使用できません）';
        return `期間名「${normalizedTermName}」は使用できません。使用できる期間名: ${allowedMessage}`;
      }

      const termId = await resolveTermId(toolContext, calendarId, normalizedTermName);

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return '日付の形式が正しくありません。YYYY-MM-DD形式で入力してください。';
      }

      if (start > end) {
        return '開始日は終了日より前である必要があります。';
      }

      const result: { updatedCount: number; dateRange: string } = await toolContext.runMutation(
        internal.calendarDayTools.updatePeriod,
        {
          calendarId,
          startDate,
          endDate,
          type: '試験日',
          termId,
        },
      );

      const response = `${result.dateRange}の期間（${result.updatedCount}日間）を学期「${normalizedTermName}」の「試験日」として登録しました。 `;

      logToolCall('set_exam_period', { startDate, endDate, termName }, context, response, 'success');
      return response;
    } catch (error) {
      console.error('Exam period tool execution error:', error);
      const errorMessage = `期間一括変更に失敗しました: ${error instanceof Error ? error.message : error}`;
      logToolCall('set_exam_period', { startDate, endDate, termName }, context, errorMessage, 'error');
      return errorMessage;
    }
  },
});

// カレンダー集計ツール
const calendarSummaryTool = tool({
  name: 'get_calendar_summary',
  description:
    '選択中のカレンダーについて、期間ごとの授業曜日別日数と春休み・夏休み・冬休みの日数を一覧で取得します。曜日別の授業回数が揃っているか確認する際に使用してください。',
  parameters: z.object({}),
  async execute(_, context): Promise<string> {
    try {
      const toolContext = getToolContext(context);
      if (!toolContext) {
        return '内部エラーが発生しました。もう一度お試しください。';
      }

      const calendarId = toolContext.calendarId;

      if (!calendarId) {
        return 'カレンダーが選択されていません。左側のプルダウンでカレンダーを選択してください。';
      }

      const summary = (await toolContext.runQuery(api.termManager.getCalendarSummary, {
        calendarId,
      })) as CalendarSummaryRecord;

      const weekdayLabels = ['月', '火', '水', '木', '金', '土'];
      const formattedTermSummaries = summary.termSummaries.map((item) => ({
        termId: item.termId ?? null,
        termName: item.termName,
        weekdayCounts: Object.fromEntries(
          item.weekdayCounts.map((count, index) => [
            weekdayLabels[index] ?? `不明(${index})`,
            count,
          ]),
        ),
      }));

      const hasTermData = formattedTermSummaries.length > 0;
      const hasVacationData = summary.vacationSummaries.some((entry) => entry.count > 0);

      if (!hasTermData && !hasVacationData) {
        return '授業日または長期休暇が登録されている期間が見つかりませんでした。';
      }

      const formattedVacations = summary.vacationSummaries.reduce<Record<string, number>>(
        (acc, entry) => {
          acc[entry.label] = entry.count;
          return acc;
        },
        {},
      );

      const responsePayload = {
        termSummaries: formattedTermSummaries,
        vacationCounts: formattedVacations,
      };

      const response = JSON.stringify(responsePayload, null, 2);
      logToolCall('get_calendar_summary', {}, context, response, 'success');
      return response;
    } catch (error) {
      console.error('Calendar summary tool execution error:', error);
      const errorMessage = `カレンダー集計の取得に失敗しました: ${error instanceof Error ? error.message : error}`;
      logToolCall('get_calendar_summary', {}, context, errorMessage, 'error');
      return errorMessage;
    }
  },
});

// 期間と曜日を指定して授業日の一覧を取得するツール
const termWeekdayDetailTool = tool({
  name: 'list_term_weekday_dates',
  description:
    '学期名と授業曜日を指定して、その条件に一致する授業日の一覧を取得します。授業回数の差異がある場合の原因調査に利用してください。',
  parameters: z.object({
    termName: z
      .string()
      .describe('授業日を確認したい学期名。未分類を確認したい場合は「未分類」と入力します。'),
    weekday: z
      .enum(['日', '月', '火', '水', '木', '金', '土'])
      .describe('確認したい授業曜日（例: 月）。'),
  }),
  async execute({ termName, weekday }, context): Promise<string> {
    try {
      const toolContext = getToolContext(context);
      if (!toolContext) {
        return '内部エラーが発生しました。もう一度お試しください。';
      }

      const calendarId = toolContext.calendarId;

      if (!calendarId) {
        return 'カレンダーが選択されていません。左側のプルダウンでカレンダーを選択してください。';
      }

      const trimmedTermName = termName.trim();
      if (!trimmedTermName) {
        return '学期名を入力してください。未分類を確認する場合は「未分類」と入力してください。';
      }

      let termId: Id<"calendar_terms"> | undefined;
      if (trimmedTermName !== UNASSIGNED_TERM_NAME) {
        termId = await lookupTermId(toolContext, calendarId, trimmedTermName);
        if (!termId) {
          return `学期「${trimmedTermName}」はカレンダー内に見つかりませんでした。`; 
        }
      }

      const dates = (await toolContext.runQuery(
        api.termManager.getTermWeekdayDates,
        {
          calendarId,
          termId,
          weekday,
        },
      )) as TermWeekdayDetailRecord[];

      if (dates.length === 0) {
        return `学期「${trimmedTermName}」の${weekday}曜授業日は見つかりませんでした。`;
      }

      const response = JSON.stringify(dates, null, 2);
      logToolCall('list_term_weekday_dates', { termName, weekday }, context, response, 'success');
      return response;
    } catch (error) {
      console.error('Term weekday detail tool execution error:', error);
      const errorMessage = `授業日一覧の取得に失敗しました: ${error instanceof Error ? error.message : error}`;
      logToolCall('list_term_weekday_dates', { termName, weekday }, context, errorMessage, 'error');
      return errorMessage;
    }
  },
});

// エージェントの作成
const createAgent = (
  fiscalYear?: number,
  terms: CalendarTermListEntry[] = [],
  holidays: FiscalHoliday[] = [],
  model: AgentModelId = DEFAULT_AGENT_MODEL,
  memo?: string,
  inputInformation?: string,
): Agent<AgentToolContext> => {
  const termDescriptors = terms.map((term) => ({
    name: term.name,
    shortName: term.shortName,
    order: term.order,
    holidayFlag: term.holidayFlag,
  }));

  const instructions = createPromptV2({
    fiscalYear,
    terms: termDescriptors,
    holidays,
    memo,
    inputInformation,
  });

  return new Agent<AgentToolContext>({
    name: 'University Calendar Web Assistant',
    model,
    instructions,
    
    tools: [
      // Hosted tool: Web検索
      webSearchTool(),

      // Function tools: 自作ツール
      setLongVacationPeriodTool,
      setTermPeriodTool,
      setExamPeriodTool,
      updateDayDetailTool,
      calendarSummaryTool,
      termWeekdayDetailTool,
    ],
  });
};

// メッセージ処理アクション
const attachmentPayloadValidator = v.object({
  name: v.string(),
  type: v.string(),
  dataUrl: v.string(),
  size: v.optional(v.number()),
});

const toolLogEntryValidator = v.object({
  toolName: v.string(),
  args: v.any(),
  result: v.optional(v.string()),
  status: v.optional(v.union(v.literal('success'), v.literal('error'))),
  timestamp: v.number(),
});

export const processMessage = action({
  args: {
    message: v.string(),
    history: v.optional(v.array(v.object({
      role: v.union(v.literal('user'), v.literal('assistant')),
      content: v.string(),
      attachments: v.optional(v.array(attachmentPayloadValidator)),
      timestamp: v.optional(v.number()),
    }))),
    sessionId: v.optional(v.string()),
    calendarId: v.optional(v.id("calendars")),
    fiscalYear: v.optional(v.number()),
    model: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentPayloadValidator)),
  },
  returns: v.object({
    response: v.string(),
    sessionId: v.string(),
    history: v.array(v.object({
      role: v.union(v.literal('user'), v.literal('assistant')),
      content: v.string(),
      attachments: v.optional(v.array(attachmentPayloadValidator)),
      timestamp: v.optional(v.number()),
    })),
    toolCalls: v.optional(v.array(v.object({
      toolName: v.string(),
      args: v.any(),
      result: v.optional(v.string()),
    }))),
    toolLogs: v.optional(v.array(toolLogEntryValidator)),
  }),
  handler: async (
    ctx,
    { message, history = [], sessionId, calendarId, fiscalYear, model, attachments },
  ): Promise<ProcessMessageResult> => {
    const clientHistoryEntries: ProcessMessageResult['history'] = history.map((msg) => {
      const sanitizedAttachments = sanitizeAttachmentPayloadArray(
        (msg as { attachments?: unknown }).attachments,
      );
      const rawTimestamp = (msg as { timestamp?: unknown }).timestamp;
      const timestamp = typeof rawTimestamp === 'number' ? rawTimestamp : undefined;

      return {
        role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content ?? {}),
        attachments: sanitizedAttachments,
        timestamp,
      } satisfies ProcessMessageHistoryEntry;
    });

    const sanitizedNewAttachments = sanitizeAttachmentPayloadArray(attachments);
    const toolLogsForSession: ToolCallLogEntry[] = [];
    let currentSessionId = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : '';

    if (calendarId) {
      const deterministicSessionKey = `calendar_${calendarId}`;
      if (!currentSessionId || currentSessionId.startsWith('session_')) {
        currentSessionId = deterministicSessionKey;
      }
    }

    const userMessageTimestamp = Date.now();

    let persistedToolLogs: ToolCallLogEntry[] = [];
    let storedHistoryEntries: ProcessMessageResult['history'] = [];

    if (calendarId && currentSessionId) {
      try {
        const existingEvents = await ctx.runQuery(api.calendarAgentSessions.listEvents, {
          calendarId,
          sessionKey: currentSessionId,
        });

        existingEvents.forEach((event: unknown) => {
          if (!event || typeof event !== 'object') {
            return;
          }

          const eventType = (event as { eventType?: unknown }).eventType;
          if (eventType === 'tool') {
            const toolEvent = event as {
              toolName?: unknown;
              args?: unknown;
              result?: unknown;
              status?: unknown;
              timestamp?: unknown;
            };
            const toolName = typeof toolEvent.toolName === 'string' ? toolEvent.toolName : '';
            if (!toolName) {
              return;
            }
            const timestamp =
              typeof toolEvent.timestamp === 'number' && Number.isFinite(toolEvent.timestamp)
                ? toolEvent.timestamp
                : Date.now();
            const status =
              toolEvent.status === 'success' || toolEvent.status === 'error'
                ? toolEvent.status
                : undefined;
            const resultText =
              typeof toolEvent.result === 'string' ? toolEvent.result : undefined;

            persistedToolLogs.push({
              toolName,
              args: (toolEvent as { args?: unknown }).args,
              result: resultText,
              status,
              timestamp,
            });
          } else if (eventType === 'message') {
            const messageEvent = event as {
              role?: unknown;
              content?: unknown;
              attachments?: unknown;
              timestamp?: unknown;
            };
            const role = messageEvent.role === 'assistant' ? 'assistant' : 'user';
            const rawContent =
              typeof messageEvent.content === 'string'
                ? messageEvent.content
                : JSON.stringify(messageEvent.content ?? {});
            const timestamp =
              typeof messageEvent.timestamp === 'number' && Number.isFinite(messageEvent.timestamp)
                ? messageEvent.timestamp
                : undefined;
            const attachments = sanitizeAttachmentPayloadArray(
              (messageEvent as { attachments?: unknown }).attachments,
            );

            storedHistoryEntries.push({
              role,
              content: rawContent,
              attachments,
              timestamp,
            });
          }
        });
      } catch (fetchError) {
        console.error('Failed to fetch existing session events:', fetchError);
      }
    }

    const previousHistoryEntries =
      storedHistoryEntries.length > 0 ? storedHistoryEntries : clientHistoryEntries;

    if (calendarId) {
      try {
        await ctx.runMutation(api.calendarAgentSessions.appendEvents, {
          calendarId,
          sessionKey: currentSessionId,
          events: [
            {
              eventType: 'message' as const,
              role: 'user' as const,
              content: message,
              timestamp: userMessageTimestamp,
              ...(sanitizedNewAttachments
                ? { attachments: sanitizedNewAttachments }
                : {}),
            },
          ],
        });
      } catch (persistError) {
        console.error('Failed to persist user message event:', persistError);
      }
    }

    try {
      let terms: CalendarTermListEntry[] = [];
      let calendarMemo: string | undefined;
      let calendarInputInformation: string | undefined;
      if (calendarId) {
        try {
          terms = (await ctx.runQuery(api.calendarTerms.listTerms, {
            calendarId,
          })) as CalendarTermListEntry[];
        } catch (error) {
          console.error('Failed to fetch term list:', error);
        }

        try {
          const metadata = await ctx.runQuery(api.calendars.getCalendarMetadata, {
            calendarId,
          });
          if (metadata) {
            calendarMemo = typeof metadata.memo === 'string' ? metadata.memo : undefined;
            calendarInputInformation = typeof metadata.inputInformation === 'string'
              ? metadata.inputInformation
              : undefined;
          }
        } catch (error) {
          console.error('Failed to fetch calendar metadata:', error);
        }
      }

      const allowedTermNames = Array.from(new Set(
        terms
          .map((term) => (typeof term?.name === 'string' ? term.name.trim() : ''))
          .filter((name) => name.length > 0),
      ));

      let fiscalHolidays: FiscalHoliday[] = [];
      if (typeof fiscalYear === 'number') {
        try {
          fiscalHolidays = await fetchFiscalHolidays(fiscalYear);
        } catch (error) {
          console.error('Failed to fetch fiscal holidays:', error);
        }
      }

      // エージェントを作成（年度情報と期間名を渡す）
      const resolvedModel = typeof model === 'string' && isAgentModelId(model)
        ? model
        : DEFAULT_AGENT_MODEL;

      const agent = createAgent(
        fiscalYear,
        terms,
        fiscalHolidays,
        resolvedModel,
        calendarMemo,
        calendarInputInformation,
      );
      
      // セッションIDの生成（必要に応じて）
      if (!currentSessionId) {
        currentSessionId = calendarId ? `calendar_${calendarId}` : `session_${Date.now()}`;
      }

      // contextにcalendarIdを追加し、ツールから利用する関数を明示的に渡す
      const contextWithCalendarInfo: AgentToolContext = {
        runMutation: ctx.runMutation,
        runQuery: ctx.runQuery,
        calendarId,
        allowedTermNames,
        terms,
        logCollector: async (entry) => {
          toolLogsForSession.push(entry);
          if (!calendarId) {
            return;
          }
          try {
            await ctx.runMutation(api.calendarAgentSessions.appendEvents, {
              calendarId,
              sessionKey: currentSessionId,
              events: [
                {
                  eventType: 'tool' as const,
                  toolName: entry.toolName,
                  args: entry.args,
                  result: entry.result,
                  status: entry.status,
                  timestamp: entry.timestamp,
                },
              ],
            });
          } catch (logPersistError) {
            console.error('Failed to persist tool log event:', logPersistError);
          }
        },
      };
      // 履歴をAgentInputItem[]に変換

      const agentHistory: AgentInputItem[] = previousHistoryEntries.map((msg) =>
        msg.role === 'user'
          ? user(buildUserContentItems(msg.content, msg.attachments))
          : assistant(msg.content)
      );

      // 新しいユーザーメッセージを追加
      agentHistory.push(user(buildUserContentItems(message, sanitizedNewAttachments)));
      
      // エージェントを実行（履歴を渡す、最大ターン数を100に設定）
      const result = await run(agent, agentHistory, {
        context: contextWithCalendarInfo,
        maxTurns: 100,
      }) as RunResult<AgentToolContext, Agent<AgentToolContext, AgentOutputType>>;
      
      // ツール呼び出しの情報を整理
      // OpenAI Agents SDKのrunResultには直接messagesプロパティがないため、
      // ツール呼び出し情報は現時点では取得できない
      const toolCalls: ProcessMessageResult['toolCalls'] = undefined;
      
      // デバッグ: result.historyの構造を確認
      // 安全な履歴処理: result.historyを使わず、手動で履歴を構築
      const finalOutput = typeof result.finalOutput === 'string'
        ? result.finalOutput
        : "申し訳ございません。回答を生成できませんでした。";

      const assistantTimestamp = Date.now();

      const updatedHistory: ProcessMessageResult['history'] = [
        ...previousHistoryEntries,
        { role: 'user', content: message, attachments: sanitizedNewAttachments, timestamp: userMessageTimestamp },
        { role: 'assistant', content: finalOutput, timestamp: assistantTimestamp },
      ];

      const mergedToolLogs = [...persistedToolLogs, ...toolLogsForSession].sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      if (calendarId) {
        try {
          await ctx.runMutation(api.calendarAgentSessions.appendEvents, {
            calendarId,
            sessionKey: currentSessionId,
            events: [
              {
                eventType: 'message' as const,
                role: 'assistant' as const,
                content: finalOutput,
                timestamp: assistantTimestamp,
              },
            ],
          });
        } catch (persistAssistantError) {
          console.error('Failed to persist assistant message event:', persistAssistantError);
        }
      }

      return {
        response: finalOutput,
        sessionId: currentSessionId,
        history: updatedHistory,
        toolCalls: toolCalls || undefined,
        toolLogs: mergedToolLogs,
      };
    } catch (error) {
      console.error('Error processing message:', error);

      // エラー時も履歴を更新
      const errorMessage = `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`;
      if (!currentSessionId) {
        currentSessionId = calendarId ? `calendar_${calendarId}` : `session_${Date.now()}`;
      }
      const errorHistory: ProcessMessageResult['history'] = [
        ...previousHistoryEntries,
        { role: 'user', content: message, attachments: sanitizedNewAttachments, timestamp: userMessageTimestamp },
        { role: 'assistant', content: errorMessage, timestamp: Date.now() },
      ];

      const mergedToolLogs = [...persistedToolLogs, ...toolLogsForSession].sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      if (calendarId) {
        try {
          await ctx.runMutation(api.calendarAgentSessions.appendEvents, {
            calendarId,
            sessionKey: currentSessionId,
            events: [
              {
                eventType: 'message' as const,
                role: 'assistant' as const,
                content: errorMessage,
                timestamp: Date.now(),
              },
            ],
          });
        } catch (persistErrorMessage) {
          console.error('Failed to persist error message event:', persistErrorMessage);
        }
      }

      return {
        response: errorMessage,
        sessionId: currentSessionId,
        history: errorHistory,
        toolCalls: undefined,
        toolLogs: mergedToolLogs,
      };
    }
  },
});
