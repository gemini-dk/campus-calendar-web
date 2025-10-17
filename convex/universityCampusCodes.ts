"use node";

import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const AREA_JSON_URL = "https://www.jma.go.jp/bosai/common/const/area.json";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_UNIVERSITY_MODEL ?? "gpt-4.1-mini";

type AreaJson = {
  centers: Record<string, {
    name: string;
    enName?: string;
    officeName?: string;
    children?: string[];
  }>;
  offices: Record<string, {
    name: string;
    enName?: string;
    officeName?: string;
    parent?: string;
    children?: string[];
  }>;
  class10s: Record<string, {
    name: string;
    enName?: string;
    parent: string;
    children?: string[];
  }>;
  class15s: Record<string, {
    name: string;
    enName?: string;
    parent: string;
    children?: string[];
  }>;
  class20s: Record<string, {
    name: string;
    enName?: string;
    kana?: string;
    parent: string;
    children?: string[];
  }>;
};

type CampusRecord = {
  _id: Id<"university_campuses">;
  universityCode: string;
  campusName?: string;
  universityName?: string;
  prefecture?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  officeCode?: string;
  officeName?: string;
  class10Code?: string;
  class10Name?: string;
};

async function downloadAreaJson(): Promise<AreaJson> {
  const res = await fetch(AREA_JSON_URL);
  if (!res.ok) {
    throw new Error(`気象庁エリアデータの取得に失敗しました: ${res.status}`);
  }
  const json = (await res.json()) as AreaJson;
  return json;
}

type OfficeClass10Entry = {
  centerCode: string;
  centerName: string;
  officeCode: string;
  officeName: string;
  class10Code: string;
  class10Name: string;
  displayName: string;
  children: string[];
};

const buildOfficeClass10Entries = (area: AreaJson): OfficeClass10Entry[] => {
  const entries: OfficeClass10Entry[] = [];
  for (const [centerCode, center] of Object.entries(area.centers)) {
    const officeCodes = center.children ?? [];
    for (const officeCode of officeCodes) {
      const office = area.offices[officeCode];
      if (!office) continue;
      const class10Codes = office.children ?? [];
      for (const class10Code of class10Codes) {
        const class10 = area.class10s[class10Code];
        if (!class10) continue;
        const class15Codes = class10.children ?? [];
        const children: string[] = [];
        for (const class15Code of class15Codes) {
          const class15 = area.class15s[class15Code];
          const class15Name = class15?.name ?? class15Code;
          const class20Codes = class15?.children ?? [];
          if (class20Codes.length === 0) {
            children.push(class15Name);
            continue;
          }
          for (const class20Code of class20Codes) {
            const class20 = area.class20s[class20Code];
            const class20Name = class20?.name ?? class20Code;
            children.push(`${class15Name} - ${class20Name}`);
          }
        }
        entries.push({
          centerCode,
          centerName: center.name,
          officeCode,
          officeName: office.name,
          class10Code,
          class10Name: class10.name,
          displayName: `${center.name} - ${office.name} - ${class10.name}`,
          children,
        });
      }
    }
  }
  return entries;
};

const campusResultValidator = v.object({
  _id: v.id("university_campuses"),
  universityCode: v.string(),
  campusName: v.optional(v.string()),
  universityName: v.optional(v.string()),
  prefecture: v.optional(v.string()),
  city: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  address: v.optional(v.string()),
  officeCode: v.optional(v.string()),
  officeName: v.optional(v.string()),
  class10Code: v.optional(v.string()),
  class10Name: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
});

type EnrichCampusReturn = {
  ok: boolean;
  skipped: boolean;
  campus?: CampusRecord;
  officeCode?: string;
  officeName?: string;
  class10Code?: string;
  class10Name?: string;
  confidence?: string;
  reason?: string;
  alternativeOfficeCodes?: string[];
  notes?: string;
  model?: string;
};

type EnrichCampusResult = EnrichCampusReturn & {
  campusId: Id<"university_campuses">;
  error?: string;
};

const campusEnrichResultValidator = v.object({
  campusId: v.id("university_campuses"),
  ok: v.boolean(),
  skipped: v.boolean(),
  campus: v.optional(campusResultValidator),
  officeCode: v.optional(v.string()),
  officeName: v.optional(v.string()),
  class10Code: v.optional(v.string()),
  class10Name: v.optional(v.string()),
  confidence: v.optional(v.string()),
  reason: v.optional(v.string()),
  alternativeOfficeCodes: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
  model: v.optional(v.string()),
  error: v.optional(v.string()),
});

type CampusPromptEntry = {
  key: string;
  campus: CampusRecord;
};

type AiResponseItem = {
  campusKey: string;
  class10Code?: string;
  confidence?: string;
  reason?: string;
  alternativeOfficeCodes?: unknown;
  notes?: string;
};

function buildBatchPrompt(campuses: CampusPromptEntry[], options: OfficeClass10Entry[]) {
  const campusCount = campuses.length;
  const campusPayload = campuses.map(({ key, campus }) => ({
    campusKey: key,
    campus: {
      universityCode: campus.universityCode,
      universityName: campus.universityName ?? null,
      campusName: campus.campusName ?? null,
      prefecture: campus.prefecture ?? null,
      city: campus.city ?? null,
      postalCode: campus.postalCode ?? null,
      address: campus.address ?? null,
      existingOfficeCode: campus.officeCode ?? null,
      existingClass10Code: campus.class10Code ?? null,
    },
  }));

  const optionPayload = options.map((entry) => ({
    class10Code: entry.class10Code,
    displayName: entry.displayName,
    children: entry.children,
  }));

  const outputFormat = [
    {
      campusKey: "campus_1",
      class10Code: "",
      confidence: "高/中/低のいずれか",
      reason: "選定理由（日本語）",
      notes: "補足があれば記載。無ければ空文字。",
    },
  ];

  return [
    `以下の大学キャンパス${campusCount}件について、住所等の情報をもとに最も適切な気象庁予報区（センター-地方気象台-一次細分区域の組み合わせ）を1件選定してください。`,
    "候補一覧 options の displayName と children を参照し、必ず class10Code を選択してください。children には class15/class20 の名称階層が含まれます。",
    "出力はJSON配列のみとし、各要素に campusKey, class10Code, confidence(高/中/低), reason(日本語), notes(補足または空文字) を含めてください。",
    "campuses:",
    JSON.stringify(campusPayload, null, 2),
    "options:",
    JSON.stringify(optionPayload, null, 2),
    "出力例:",
    JSON.stringify(outputFormat, null, 2),
  ].join("\n\n");
}

async function callOpenAiForPrompt(prompt: string): Promise<Map<string, AiResponseItem>> {
  if (!prompt) return new Map();

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    throw new Error("OPENAI_API_KEY が設定されていません");
  }
  console.log("[enrichUniversityCampuses] OpenAI prompt\n", prompt);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "あなたは日本の気象庁に関する専門家です。必ずJSONのみを出力してください。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API呼び出しに失敗しました: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI APIから有効な応答が得られませんでした");
  }

  console.log("[enrichUniversityCampuses] OpenAI raw response\n", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`OpenAI出力のJSON解析に失敗しました: ${(error as Error).message}`);
  }

  let items: AiResponseItem[] = [];
  if (Array.isArray(parsed)) {
    items = parsed as AiResponseItem[];
  } else if (parsed && typeof parsed === "object") {
    const parsedObj = parsed as Record<string, unknown>;
    const maybeResults = parsedObj["results"];
    if (Array.isArray(maybeResults)) {
      items = maybeResults as AiResponseItem[];
    } else {
      items = Object.entries(parsedObj).map(([key, value]) => ({
        campusKey: key,
        ...(typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}),
      })) as AiResponseItem[];
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("OpenAIから配列形式の結果が得られませんでした");
  }

  const map = new Map<string, AiResponseItem>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const campusKeyRaw = (item as Record<string, unknown>).campusKey;
    if (typeof campusKeyRaw !== "string" || campusKeyRaw.trim().length === 0) continue;
    map.set(campusKeyRaw.trim(), item as AiResponseItem);
  }

  return map;
}

async function enrichCampusesBulk(
  ctx: ActionCtx,
  campusIds: Id<"university_campuses">[],
  force?: boolean
): Promise<EnrichCampusResult[]> {
  const resultsById = new Map<Id<"university_campuses">, EnrichCampusResult>();
  const pendingList: Array<{
    key: string;
    campusId: Id<"university_campuses">;
    campus: CampusRecord;
  }> = [];

  const forceMode = force === true;

  let index = 0;
  for (const campusId of campusIds) {
    const campus = (await ctx.runQuery(api.universities.getCampusById, { id: campusId })) as CampusRecord | null;
    if (!campus) {
      resultsById.set(campusId, {
        campusId,
        ok: false,
        skipped: false,
        error: "キャンパス情報が見つかりません",
        model: DEFAULT_OPENAI_MODEL,
      });
      continue;
    }

    index += 1;
    pendingList.push({ key: `campus_${index}`, campusId, campus });
  }

  if (pendingList.length > 0) {
    const areaJson = await downloadAreaJson();
    const officeClass10Entries = buildOfficeClass10Entries(areaJson);
    const optionMapByPair = new Map<string, OfficeClass10Entry>();
    const optionMapByClass10 = new Map<string, OfficeClass10Entry>();
    for (const entry of officeClass10Entries) {
      optionMapByPair.set(`${entry.officeCode}::${entry.class10Code}`, entry);
      optionMapByClass10.set(entry.class10Code, entry);
    }
    const promptEntries: CampusPromptEntry[] = pendingList.map(({ key, campus }) => ({
      key,
      campus,
    }));
    const prompt = [
      forceMode ? "force モードで既存コードを上書きします。" : "既存コードがあってもAI選定結果で上書きします。",
      buildBatchPrompt(promptEntries, officeClass10Entries),
    ].join("\n\n");

    let aiMap: Map<string, AiResponseItem> | null = null;
    try {
      aiMap = await callOpenAiForPrompt(prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const { campusId, campus } of pendingList) {
        resultsById.set(campusId, {
          campusId,
          ok: false,
          skipped: false,
          campus,
          error: message,
          model: DEFAULT_OPENAI_MODEL,
        });
      }
    }

    if (aiMap) {
      for (const entry of pendingList) {
        if (resultsById.has(entry.campusId)) continue;
        const campus = entry.campus;
        const ai = aiMap.get(entry.key);
        if (!ai) {
          resultsById.set(entry.campusId, {
            campusId: entry.campusId,
            ok: false,
            skipped: false,
            campus,
            error: "AIから結果が返却されませんでした",
            model: DEFAULT_OPENAI_MODEL,
          });
          continue;
        }
        const class10Code = typeof ai.class10Code === "string" ? ai.class10Code.trim() : "";
        if (!class10Code) {
          resultsById.set(entry.campusId, {
            campusId: entry.campusId,
            ok: false,
            skipped: false,
            campus,
            error: "AI出力に class10Code が含まれていません",
            model: DEFAULT_OPENAI_MODEL,
          });
          continue;
        }

        const aiRecord = ai as Record<string, unknown>;
        let officeCode = typeof aiRecord.officeCode === "string" ? aiRecord.officeCode.trim() : "";
        let lookup: OfficeClass10Entry | undefined;
        if (officeCode) {
          lookup = optionMapByPair.get(`${officeCode}::${class10Code}`);
        }
        if (!lookup) {
          lookup = optionMapByClass10.get(class10Code);
          officeCode = lookup?.officeCode ?? officeCode;
        }

        if (!lookup || !lookup.officeCode) {
          resultsById.set(entry.campusId, {
            campusId: entry.campusId,
            ok: false,
            skipped: false,
            campus,
            error: `class10Code ${class10Code} に対応する候補が見つかりません`,
            model: DEFAULT_OPENAI_MODEL,
          });
          continue;
        }

        const officeName = lookup.officeName;
        const class10Name = lookup.class10Name;
        const confidence = typeof ai.confidence === "string" ? ai.confidence : undefined;
        const reason = typeof ai.reason === "string" ? ai.reason : undefined;
        const notes = typeof ai.notes === "string" ? ai.notes : undefined;
        const alternativeOfficeCodes = Array.isArray(ai.alternativeOfficeCodes)
          ? (ai.alternativeOfficeCodes as unknown[]).filter((value): value is string => typeof value === "string")
          : undefined;

        const updated = (await ctx.runMutation(api.universities.updateCampusCodes, {
          campusId: entry.campusId,
          officeCode,
          officeName,
          class10Code,
          class10Name,
        })) as CampusRecord | null;

        if (!updated) {
          resultsById.set(entry.campusId, {
            campusId: entry.campusId,
            ok: false,
            skipped: false,
            campus,
            error: "キャンパスの更新結果が取得できませんでした",
            model: DEFAULT_OPENAI_MODEL,
          });
          continue;
        }

        resultsById.set(entry.campusId, {
          campusId: entry.campusId,
          ok: true,
          skipped: false,
          campus: updated,
          officeCode,
          officeName,
          class10Code,
          class10Name,
          confidence,
          reason,
          alternativeOfficeCodes,
          notes,
          model: DEFAULT_OPENAI_MODEL,
        });
      }
    }
  }

  return campusIds.map((campusId) => {
    const result = resultsById.get(campusId);
    return (
      result ?? {
        campusId,
        ok: false,
        skipped: false,
        error: "結果を生成できませんでした",
        model: DEFAULT_OPENAI_MODEL,
      }
    );
  });
}

export const enrichCampusCodes = action({
  args: {
    campusId: v.id("university_campuses"),
    force: v.optional(v.boolean()),
  },
  returns: campusEnrichResultValidator,
  handler: async (ctx, { campusId, force }) => {
    const results = await enrichCampusesBulk(ctx, [campusId], force);
    return results[0];
  },
});

export const enrichUniversityCampuses = action({
  args: {
    universityCode: v.string(),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    ok: v.boolean(),
    universityCode: v.string(),
    total: v.number(),
    successCount: v.number(),
    skippedCount: v.number(),
    failureCount: v.number(),
    results: v.array(campusEnrichResultValidator),
  }),
  handler: async (ctx, { universityCode, force }) => {
    const campuses = (await ctx.runQuery(api.universities.listCampusesByUniversityCode, {
      universityCode,
    })) as CampusRecord[];

    if (campuses.length === 0) {
      return {
        ok: true,
        universityCode,
        total: 0,
        successCount: 0,
        skippedCount: 0,
        failureCount: 0,
        results: [],
      };
    }

    const campusIds = campuses.map((campus) => campus._id);
    const results = await enrichCampusesBulk(ctx, campusIds, force);
    const successCount = results.filter((r) => r.ok && !r.skipped && !r.error).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const failureCount = results.filter((r) => r.error || !r.ok).length;

    return {
      ok: true,
      universityCode,
      total: campuses.length,
      successCount,
      skippedCount,
      failureCount,
      results,
    };
  },
});
