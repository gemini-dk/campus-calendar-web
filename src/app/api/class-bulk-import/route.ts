import { NextResponse } from 'next/server';

import { generateObject } from 'ai';
import { z } from 'zod';

import { createFireworksModel } from '@/lib/ai/fireworks';

const candidateTermSchema = z.object({
  id: z.string(),
  name: z.string(),
});

type AiWeeklySlot = {
  dayOfWeek: unknown;
  period: unknown;
};

type AiClass = {
  className: unknown;
  classType: 'in_person' | 'online' | 'hybrid' | 'on_demand';
  termNames: unknown[];
  weeklySlots: AiWeeklySlot[];
  location: string | null | undefined;
  teacher: string | null | undefined;
  credits: number | string | null | undefined;
  isFullyOnDemand: boolean;
};

type NormalizedClass = {
  className: string;
  classType: 'in_person' | 'online' | 'hybrid' | 'on_demand';
  termIds: string[];
  termNames: string[];
  weeklySlots: Array<{ dayOfWeek: number; period: number | 'OD' }>;
  location: string | null;
  teacher: string | null;
  credits: number | string | null;
  isFullyOnDemand: boolean;
};

const DAY_OF_WEEK_MAP: Record<string, number> = {
  月: 1,
  火: 2,
  水: 3,
  木: 4,
  金: 5,
  土: 6,
  日: 7,
};

const SYSTEM_PROMPT = `あなたは履修登録管理者です。与えられたデータをもとに履修済み授業を判定し、指定フォーマットで登録用データを作成します。
- 学期は必須です。与えられた候補から名称を選び、通年授業なら複数の学期を並べます。
- typeの意味:
  - in_person: 大学キャンパスでの対面授業。曜日と時限は必須。
  - online: オンラインでリアルタイムに行う授業。曜日と時限は必須。
  - hybrid: 対面とオンラインを組み合わせた授業。曜日と時限は必須。
  - on_demand: あらかじめ収録された授業。配信曜日が決まっている場合は曜日を指定し、時限は0か'OD'を使う。全て一括配信でいつでも受講できる場合は weeklySlots を空にし、isFullyOnDemand を true にする。
  記載がない場合はin_personを選択してください。
- weeklySlots の dayOfWeek は「月」「火」「水」「木」「金」「土」「日」のいずれかを必ず使用する。period は 1..N の数値または 'OD'/0。`;

function buildAiClassSchema(termNameEnum: string[]) {
  const termNameSchema =
    termNameEnum.length > 0 ? z.enum(termNameEnum as [string, ...string[]]) : z.string();

  const aiWeeklySlotSchema = z.object({
    dayOfWeek: z.string(),
    period: z.union([z.number(), z.literal('OD'), z.string()]),
  });

  return z.array(
    z.object({
      className: z.string(),
      classType: z.enum(['in_person', 'online', 'hybrid', 'on_demand']),
      termNames: z.array(termNameSchema).default([]),
      weeklySlots: z.array(aiWeeklySlotSchema).default([]),
      location: z.string().nullable().optional(),
      teacher: z.string().nullable().optional(),
      credits: z.union([z.number(), z.string(), z.null()]).optional(),
      isFullyOnDemand: z.boolean().default(false),
    }),
  );
}

type AiClassSchema = ReturnType<typeof buildAiClassSchema>;
type AiClassResult = z.infer<AiClassSchema>[number];

function normalizeDayOfWeek(value: unknown): number | null {
  if (typeof value === 'number' && value >= 1 && value <= 7) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/曜日?$/u, '');
  const mapped = DAY_OF_WEEK_MAP[normalized as keyof typeof DAY_OF_WEEK_MAP];
  return mapped ?? null;
}

function normalizePeriod(value: unknown): number | 'OD' | null {
  if (value === 'OD') {
    return 'OD';
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed <= 0) {
    return 'OD';
  }
  return parsed;
}

function normalizeCredits(value: unknown): number | string | null {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  return null;
}

function normalizeTermName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildTermNameToIdMap(candidates: Array<z.infer<typeof candidateTermSchema>>): Map<string, string> {
  const map = new Map<string, string>();
  candidates.forEach((candidate) => {
    const normalized = normalizeTermName(candidate.name);
    if (normalized) {
      map.set(normalized, candidate.id);
    }
  });
  return map;
}

function normalizeWeeklySlots(slots: AiWeeklySlot[]): Array<{ dayOfWeek: number; period: number | 'OD' }> {
  const normalized: Array<{ dayOfWeek: number; period: number | 'OD' }> = [];
  slots.forEach((slot) => {
    const dayOfWeek = normalizeDayOfWeek(slot.dayOfWeek);
    const period = normalizePeriod(slot.period);
    if (dayOfWeek && period !== null) {
      normalized.push({ dayOfWeek, period });
    }
  });
  return normalized;
}

function normalizeClass(
  aiClass: AiClassResult,
  termNameToId: Map<string, string>,
): NormalizedClass {
  const termNames = Array.from(
    new Set(
      aiClass.termNames
        .map((name) => normalizeTermName(name))
        .filter((name): name is string => Boolean(name)),
    ),
  );

  const termIds = termNames
    .map((name) => termNameToId.get(name))
    .filter((id): id is string => Boolean(id));

  const weeklySlots = normalizeWeeklySlots(aiClass.weeklySlots);
  const isFullyOnDemand = aiClass.isFullyOnDemand || weeklySlots.length === 0;

  return {
    className: aiClass.className,
    classType: aiClass.classType,
    termIds,
    termNames,
    weeklySlots,
    location: aiClass.location?.trim() || null,
    teacher: aiClass.teacher?.trim() || null,
    credits: normalizeCredits(aiClass.credits),
    isFullyOnDemand,
  };
}

function sanitizeCandidates(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const set = new Set<string>();
  values.forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      set.add(trimmed);
    }
  });
  return Array.from(set);
}

function buildSchemaForPrompt(termNameEnum: string[]): string {
  const classNameProperty: Record<string, unknown> = {
    type: 'string',
    description: '授業名',
  };

  const termNameItem: Record<string, unknown> = {
    type: 'string',
    description: '学期名称（候補から選ぶ）',
  };
  if (termNameEnum.length > 0) {
    termNameItem.enum = termNameEnum;
  }

  const schema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        className: classNameProperty,
        classType: {
          type: 'string',
          enum: ['in_person', 'online', 'hybrid', 'on_demand'],
          description: '授業形態',
        },
        termNames: { type: 'array', items: termNameItem, description: '学期名称（候補から選ぶ）' },
        weeklySlots: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              dayOfWeek: { type: 'string', enum: ['月', '火', '水', '木', '金', '土', '日'] },
              period: { oneOf: [{ type: 'number' }, { type: 'string', enum: ['OD'] }] },
            },
            required: ['dayOfWeek', 'period'],
          },
          description: '曜日と時限の組み合わせ',
        },
        location: { type: ['string', 'null'] },
        teacher: { type: ['string', 'null'] },
        credits: { type: ['number', 'string', 'null'] },
        isFullyOnDemand: { type: 'boolean' },
      },
      required: ['className', 'classType', 'termNames', 'weeklySlots', 'isFullyOnDemand'],
    },
  };

  return JSON.stringify(schema, null, 2);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      text?: string;
      termCandidates?: Array<z.infer<typeof candidateTermSchema>>;
    };
    const text = body.text ?? '';
    const termCandidates = body.termCandidates ?? [];

    if (!text.trim()) {
      return NextResponse.json({ error: '入力が空です。授業一覧を入力してください。' }, { status: 400 });
    }

    const apiKey = process.env.FIREWORKS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'FireworksのAPIキーが設定されていません。' }, { status: 500 });
    }

    const model = createFireworksModel('accounts/fireworks/models/gpt-oss-20b', apiKey);

    const availableTerms = termCandidates;
    const termNameEnum = availableTerms.map((term) => term.name);
    const termNameToId = buildTermNameToIdMap(availableTerms);

    const aiClassSchema = buildAiClassSchema(termNameEnum);

    const termContext =
      termNameEnum.length > 0
        ? `利用可能な学期候補（休講期間を除外済み、名称のみ使用）:\n${termNameEnum
            .map((name) => `- ${name}`)
            .join('\n')}`
        : '利用可能な学期候補はありません。学期が特定できない場合は termNames を空配列にしてください。';

//    const classNameContext =
//      classNameEnum.length > 0
//        ? `授業名は下記の候補から必ず選択してください:\n${classNameEnum.map((name) => `- ${name}`).join('\n')}`
//        : '授業名の候補リストはありません。入力テキストから授業名を確定してください。';

    const schemaForPrompt = buildSchemaForPrompt(termNameEnum);

    const prompt = `${SYSTEM_PROMPT}
${termContext}

返却形式はJSONのみ。下記JSON Schemaに厳密に従い、余計な文章を加えずに出力してください。
${schemaForPrompt}

下記データから授業を抽出してください。
${text}`;

console.log('prompt');
console.log(prompt);
    const result = await generateObject({
      model,
      schema: aiClassSchema,
      prompt,
    });

    const normalized = result.object.map((item) => normalizeClass(item, termNameToId));
console.log(JSON.stringify(normalized));
    return NextResponse.json({ data: normalized });
  } catch (error) {
    console.error('授業一括取り込みの変換に失敗しました', error);
    return NextResponse.json({ error: '変換に失敗しました。時間をおいて再度お試しください。' }, { status: 500 });
  }
}
