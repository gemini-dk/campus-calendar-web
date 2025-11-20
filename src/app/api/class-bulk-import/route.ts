import { NextResponse } from 'next/server';

import { generateObject } from 'ai';
import { z } from 'zod';

import { createFireworksModel } from '@/lib/ai/fireworks';

const candidateTermSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const weeklySlotSchema = z.object({
  dayOfWeek: z.union([
    z.number(),
    z.string().transform((value) => Number.parseInt(value, 10)),
  ]),
  period: z.union([
    z.number(),
    z.literal('OD'),
    z.string().transform((value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : value;
    }),
  ]),
});

const classSchema = z.array(
  z.object({
    className: z.string(),
    classType: z.enum(['in_person', 'online', 'hybrid', 'on_demand']),
    termIds: z.array(z.string()).default([]),
    termNames: z.array(z.string()).default([]),
    weeklySlots: z.array(weeklySlotSchema).default([]),
    location: z.string().nullable().optional(),
    locationInPerson: z.string().nullable().optional(),
    locationOnline: z.string().nullable().optional(),
    teacher: z.string().nullable().optional(),
    credits: z.union([z.number(), z.string(), z.null()]).optional(),
    isFullyOnDemand: z.boolean().default(false),
  }),
);

const PROMPT = `授業一覧データを、Firestoreの時間割コレクションに対応するフィールド名でJSON化してください。出力スキーマは下記です。
- className: 授業名
- classType: [in_person, online, hybrid, on_demand] のいずれか
- termIds: 学事予定の学期ID配列（候補が渡されます）
- termNames: termIdsに対応する学期名配列
- weeklySlots: {dayOfWeek:1(月)…7(日), period:1..Nまたは0/OD(オンデマンド)} 配列
- location: 教室（ハイブリッド以外）
- locationInPerson: ハイブリッドの対面教室
- locationOnline: ハイブリッドのオンラインURL
- teacher: 教員名
- credits: 単位数（数値）
- isFullyOnDemand: 週次枠が無い完全オンデマンドかどうか`;

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

    const termContext =
      termCandidates.length > 0
        ? `利用可能な学期候補:\n${termCandidates
            .map((term) => `- ${term.name} (id=${term.id})`)
            .join('\n')}`
        : '利用可能な学期候補はありません。学期が不明な場合は termIds/termNames を空にしてください。';

    const result = await generateObject({
      model,
      schema: classSchema,
      prompt: `${PROMPT}\n${termContext}\n\n学期は候補リストのIDと名称を使用してください。曜日は1=月曜,2=火曜,...,7=日曜。オンデマンドは period を 0 または 'OD' とします。週次枠が無い場合は isFullyOnDemand=true としてください。\n\n授業一覧:\n${text}`,
    });

    return NextResponse.json({ data: result.object });
  } catch (error) {
    console.error('授業一括取り込みの変換に失敗しました', error);
    return NextResponse.json({ error: '変換に失敗しました。時間をおいて再度お試しください。' }, { status: 500 });
  }
}
