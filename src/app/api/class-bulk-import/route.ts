import { NextResponse } from 'next/server';

import { generateObject } from 'ai';
import { z } from 'zod';

import { createFireworksModel } from '@/lib/ai/fireworks';

const classSchema = z.array(
  z.object({
    title: z.string(),
    type: z.enum(['対面', 'オンライン', 'ハイブリッド', 'オンデマンド', 'フルオンデマンド']),
    location: z.string().nullable().optional(),
    teacher: z.string().nullable().optional(),
    terms: z.array(z.enum(['春学期', '秋学期'])).default([]),
    weekly_slots: z
      .array(
        z.object({
          dayOfWeek: z.string(),
          period: z.string(),
        }),
      )
      .default([]),
    credits: z.union([z.number(), z.string()]).optional(),
  }),
);

const PROMPT = `授業の一覧データから、授業名、授業タイプ、学期、曜日時限、場所、教師名、単位を抽出してください。抽出したデータは下記JSON形式で出力しなさい。
- title:授業名
- type:[対面・オンライン・ハイブリッド・オンデマンド・フルオンデマンド]
- location:場所
- teacher:教師
- terms:[春学期・秋学期]（複数可)
- weekly_slots:{dayOfWeek:曜日、period:時限}(複数可)
- credits:単位`;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { text?: string };
    const text = body.text ?? '';

    if (!text.trim()) {
      return NextResponse.json({ error: '入力が空です。授業一覧を入力してください。' }, { status: 400 });
    }

    const apiKey = process.env.FIREWORKS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'FireworksのAPIキーが設定されていません。' }, { status: 500 });
    }

    const model = createFireworksModel('accounts/fireworks/models/gpt-oss-20b', apiKey);

    const result = await generateObject({
      model,
      schema: classSchema,
      prompt: `${PROMPT}\n\n授業一覧:\n${text}`,
    });

    return NextResponse.json({ data: result.object });
  } catch (error) {
    console.error('授業一括取り込みの変換に失敗しました', error);
    return NextResponse.json({ error: '変換に失敗しました。時間をおいて再度お試しください。' }, { status: 500 });
  }
}
