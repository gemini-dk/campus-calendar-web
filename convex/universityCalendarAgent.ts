"use node";

import { Agent, tool, webSearchTool, run, user, assistant, type AgentInputItem } from '@openai/agents';
import type { AgentOutputType, RunResult } from '@openai/agents';
import { z } from 'zod';
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type AgentToolContext = Pick<ActionCtx, "runMutation" | "runQuery">;

type AgentRunContext = {
  targetUniversityId?: Id<'universities'>;
  targetUniversityName?: string;
  targetFiscalYear?: number;
};

type ProcessMessageResult = {
  response: string;
  sessionId: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
};

type AgentModel = 'gpt-5-mini' | 'gpt-5' | 'gpt-4.1';

const DEFAULT_MODEL: AgentModel = 'gpt-4.1';

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

const searchUniversityTool = tool({
  name: 'search_university',
  description: '大学名の一部を指定して候補を検索し、Convex上の大学IDを取得します。',
  parameters: z.object({
    keyword: z.string().describe('大学名のキーワード'),
    limit: z.number().int().min(1).max(20).nullish().describe('取得上限。指定しない場合は5件'),
  }),
  async execute({ keyword, limit }, context) {
    const toolContext = getToolContext(context);
    if (!toolContext) {
      return 'Convexのクエリ機能にアクセスできません。';
    }

    try {
      const rows = await toolContext.runQuery(api.universities.searchByName, {
        q: keyword,
        limit: limit ?? 5,
      });
      if (!rows || rows.length === 0) {
        return '候補が見つかりませんでした。別のキーワードを試してください。';
      }

      return JSON.stringify(
        rows.map((row: { _id: Id<'universities'>; code?: string | null; name: string; prefecture?: string | null; type?: string | null }) => ({
          id: row._id,
          code: row.code,
          name: row.name,
          prefecture: row.prefecture ?? null,
          type: row.type ?? null,
        })),
        null,
        2,
      );
    } catch (error) {
      console.error('search_university tool error', error);
      return `大学検索に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const getResearchRecordTool = tool({
  name: 'get_research_record',
  description: '選定された大学・年度のリサーチ情報を取得します。保存済みの内容を確認してから修正してください。',
  parameters: z.object({
    universityId: z.string().describe('ConvexのuniversitiesテーブルのID'),
    fiscalYear: z.number().int().describe('対象年度 (例: 2024)'),
  }),
  async execute({ universityId, fiscalYear }, context) {
    const toolContext = getToolContext(context);
    if (!toolContext) {
      return 'Convexのクエリ機能にアクセスできません。';
    }

    try {
      const id = universityId as Id<'universities'>;
      const record = await toolContext.runQuery(api.universityResearch.getByUniversityYear, {
        universityId: id,
        fiscalYear,
      });
      if (!record) {
        return '該当するリサーチ記録はまだ作成されていません。';
      }
      return JSON.stringify(record, null, 2);
    } catch (error) {
      console.error('get_research_record tool error', error);
      return `リサーチ記録の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const saveResearchRecordTool = tool({
  name: 'save_research_record',
  description: '大学・年度ごとのリサーチ情報を保存または更新します。空欄にしたい項目は空文字ではなく省略してください。',
  parameters: z.object({
    universityId: z.string().describe('ConvexのuniversitiesテーブルのID'),
    fiscalYear: z.number().int().describe('対象年度 (例: 2024)'),
    termScheme: z
      .string()
      .nullish()
      .describe('学期区分に関する根拠や説明。最終アウトプットの該当箇所に紐づけて記載'),
    termSchemeSources: z
      .string()
      .nullish()
      .describe('学期区分の根拠として参照したURL。1行につき1URLで記載'),
    classTimeAndCount: z
      .string()
      .nullish()
      .describe('授業時間や授業回数の根拠や説明。最終アウトプットの時間割情報と対応させて記載'),
    classTimeAndCountSources: z
      .string()
      .nullish()
      .describe('授業時間/回数の根拠として参照したURL。1行につき1URLで記載'),
    academicCalendarLinks: z
      .string()
      .nullish()
      .describe('学事予定カレンダーの根拠。"区分:URL"形式で各キャンパス等を列挙'),
    academicCalendarLinksSources: z
      .string()
      .nullish()
      .describe('学事予定カレンダーに関する補足説明やURLを記載。1行につき1URLで記載'),
    informationSources: z
      .string()
      .nullish()
      .describe('最終アウトプット全体に関する追加の補足説明や参考URLがあれば記載'),
    finalOutput: z
      .string()
      .nullish()
      .describe('最終アウトプットのJSON文字列。指定フォーマットに従って作成'),
  }),
  async execute(
    {
      universityId,
      fiscalYear,
      termScheme,
      termSchemeSources,
      classTimeAndCount,
      classTimeAndCountSources,
      academicCalendarLinks,
      academicCalendarLinksSources,
      informationSources,
      finalOutput,
    },
    context,
  ) {
    const toolContext = getToolContext(context);
    if (!toolContext) {
      return 'Convexの更新機能にアクセスできません。';
    }

    try {
      const id = universityId as Id<'universities'>;
      const result = await toolContext.runMutation(api.universityResearch.upsert, {
        universityId: id,
        fiscalYear,
        termScheme: termScheme?.trim() ?? undefined,
        termSchemeSources: termSchemeSources ?? undefined,
        classTimeAndCount: classTimeAndCount?.trim() ?? undefined,
        classTimeAndCountSources: classTimeAndCountSources ?? undefined,
        academicCalendarLinks: academicCalendarLinks ?? undefined,
        academicCalendarLinksSources: academicCalendarLinksSources ?? undefined,
        informationSources: informationSources?.trim() ?? undefined,
        finalOutput: finalOutput?.trim() ?? undefined,
      });
      return `保存に成功しました: ${result.status}`;
    } catch (error) {
      console.error('save_research_record tool error', error);
      return `保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const buildSystemPrompt = ({
  targetUniversityName,
  targetFiscalYear,
  targetUniversityId,
}: AgentRunContext): string => {
  const targetLine = targetUniversityName
    ? `現在の調査対象: ${targetUniversityName}${typeof targetFiscalYear === 'number' ? ` (${targetFiscalYear}年度)` : ''}。` +
      (targetUniversityId ? ` Convex上の大学IDは ${targetUniversityId} です。` : '')
    : '現在の調査対象はユーザから確認してください。';

  return `${targetLine}
  あなたは日本の大学の学事予定を調べるリサーチエージェントです。
  ## 目的
  - 指定された大学・年度について公開情報を調査し、Convexの大学リサーチレコードを更新します。
  - 調査結果は「最終アウトプット(JSON形式)」としてまとめ、その根拠と情報ソースを各フィールドに整理します。

  ## 最終アウトプット形式
  下記のJSONをfinalOutputフィールドに保存し、調査完了時の応答でも提示します。必要に応じて配列要素を調整してください。
  \`\`\`json
  {
    "schedules": [
      {
        "name": "日吉キャンパス学事予定",
        "semesters": ["春学期", "秋学期"],
        "dataUrl": "https://..."
      }
    ],
    "timetables": [
      {
        "name": "日吉キャンパス時間割",
        "class_minutes": 100,
        "periods": [
          { "start": "09:10", "end": "10:40" }
        ]
      }
    ]
  }
  \`\`\`

  ## 収集する根拠
  - termScheme: 学期区分の構成や呼称の根拠を記載し、最終アウトプットの\`schedules.semesters\`と対応づけます。
  - classTimeAndCount: 授業時間・授業回数・時間割パターンの根拠を記載し、\`timetables\`の内容と対応づけます。
  - academicCalendarLinks: 学事予定カレンダーを選定した根拠、複数に分割した場合は分割した根拠を記載します。
  - termSchemeSources / classTimeAndCountSources / academicCalendarLinksSources: 上記根拠で参照したURLを1行につき1件記載します。
  - informationSources: 大学ホームページ、全体のまとめに利用した追加ソースや注意点があれば記載します。

  ## 前提・ルール
  - 対象
    - 本サービスの対象は学部生です。大学院(〇〇研究科等)の情報は利用できません。
    - 医学部の独自日程は対象外です。明確に区別されている場合は除外します。
  - 学事予定
    - 学事予定カレンダーとは授業開始日・休暇・試験・振替等が網羅される公式情報です。
    - 必ず最新の公式サイトを確認し、有効なURLのみを使用します。
    - dateUrlに記載するURLは、定義で定めた内容が記載されているページやPDFに直接辿りつけるURLです。複数の情報をまとめた親ページなどはdataUrlではなくsourceに記載します。
    - キャンパスや課程で日程が異なる場合は\`schedules\`を分け、何で分けたかがわかる名称を付与します。
  - 出力内容
    - 情報ソースは可能な限り一次情報を優先し、重複ソースを避けます。

  ## 手順
  1. 既存の記録を把握するため、最初に get_research_record ツールで対象年度の情報を取得します。
  2. 公的な情報源を調査し、最終アウトプットに必要な項目と根拠を整理します。必要に応じて webSearchTool を使用してください。
  3. 収集した根拠と最終アウトプットJSONを save_research_record ツールで保存します。空欄にする場合はユーザへ確認した上で省略してください。
  4. 全てのチェック項目を満たしたら、最終アウトプットJSONと更新サマリーを応答として返します。

  ## チェック項目
  - 最終アウトプットが有効なJSONであり、schedules/timetablesの構造が仕様通りである。
  - 参考情報は最新でリンク切れがなく、大学院や対象外の情報を含まない。
  - 学事予定カレンダーのdataUrlは学期情報への直リンクである。

  ## 応答方針
  - 日本語で簡潔かつ具体的に回答します。ツールの結果根拠など保存済みの情報の説明は不要です。
  - 調査完了時は最終アウトプットJSONを提示し、懸念点、残課題のみ伝えます.`;
};

const createAgent = (
  model: AgentModel = DEFAULT_MODEL,
  context: AgentRunContext = {},
): Agent<AgentToolContext> => {
  return new Agent<AgentToolContext>({
    name: 'Academic Calendar Research Agent',
    model,
    instructions: buildSystemPrompt(context),
    tools: [webSearchTool(), searchUniversityTool, getResearchRecordTool, saveResearchRecordTool],
  });
};

export const processMessage = action({
  args: {
    message: v.string(),
    history: v.optional(v.array(v.object({
      role: v.union(v.literal('user'), v.literal('assistant')),
      content: v.string(),
    }))),
    sessionId: v.optional(v.string()),
    model: v.optional(v.string()),
    targetUniversityId: v.optional(v.id('universities')),
    targetUniversityName: v.optional(v.string()),
    targetFiscalYear: v.optional(v.number()),
  },
  returns: v.object({
    response: v.string(),
    sessionId: v.string(),
    history: v.array(v.object({
      role: v.union(v.literal('user'), v.literal('assistant')),
      content: v.string(),
    })),
  }),
  handler: async (
    ctx,
    {
      message,
      history = [],
      sessionId,
      model,
      targetUniversityId,
      targetUniversityName,
      targetFiscalYear,
    },
  ) => {
    try {
      const resolvedModel = (model as AgentModel | undefined) ?? DEFAULT_MODEL;
      const normalizedName = typeof targetUniversityName === 'string' ? targetUniversityName.trim() : undefined;
      const agentContext: AgentRunContext = {
        targetUniversityId: targetUniversityId ?? undefined,
        targetUniversityName: normalizedName && normalizedName.length > 0 ? normalizedName : undefined,
        targetFiscalYear: typeof targetFiscalYear === 'number' ? targetFiscalYear : undefined,
      };

      const agent = createAgent(resolvedModel, agentContext);
      const currentSessionId = sessionId || `session_${Date.now()}`;
      const context: AgentToolContext = {
        runMutation: ctx.runMutation,
        runQuery: ctx.runQuery,
      };

      const sanitizedHistory: ProcessMessageResult['history'] = history.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));

      const agentHistory: AgentInputItem[] = sanitizedHistory.map((msg) =>
        msg.role === 'user' ? user(msg.content) : assistant(msg.content)
      );
      agentHistory.push(user(message));

      const result = await run(agent, agentHistory, {
        context,
        maxTurns: 15,
      }) as RunResult<AgentToolContext, Agent<AgentToolContext, AgentOutputType>>;

      const finalOutput = typeof result.finalOutput === 'string'
        ? result.finalOutput
        : '申し訳ありません。回答を生成できませんでした。';

      const updatedHistory: ProcessMessageResult['history'] = [
        ...sanitizedHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: finalOutput },
      ];

      return {
        response: finalOutput,
        sessionId: currentSessionId,
        history: updatedHistory,
      };
    } catch (error) {
      console.error('university calendar agent error', error);
      const fallbackHistory: ProcessMessageResult['history'] = [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content: 'エラーが発生しました。別の質問をお試しください。' },
      ];

      return {
        response: 'エラーが発生しました。別の質問をお試しください。',
        sessionId: sessionId || `session_${Date.now()}`,
        history: fallbackHistory,
      };
    }
  },
});
