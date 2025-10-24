import { NextResponse } from 'next/server';

import { listUniversitySearchEntries } from '@/lib/data/repository/university.repository';
import { universitySearchResponseSchema } from '@/lib/data/schema/university-search';

export async function GET(): Promise<NextResponse> {
  try {
    const entries = await listUniversitySearchEntries();
    const parsed = universitySearchResponseSchema.parse(entries);

    const response = NextResponse.json(parsed);
    response.headers.set('cache-control', 's-maxage=86400, stale-while-revalidate=86400');

    return response;
  } catch (error) {
    console.error('大学検索データの取得に失敗しました', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
