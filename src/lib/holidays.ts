export type FiscalHoliday = { date: string; name: string };

// 4/1〜翌3/31に該当する祝日を取得
type CachedRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

export async function fetchFiscalHolidays(year: number): Promise<FiscalHoliday[]> {
  const startStr = `${year.toString().padStart(4, "0")}-04-01`;
  const endStr = `${(year + 1).toString().padStart(4, "0")}-03-31`;

  // Holidays JP API (GitHub Pages)
  const requestInit: CachedRequestInit = {
    // Next.js 15 app router fetch cache hint (server-side)
    next: { revalidate: 60 * 60 * 24 },
  };

  const res = await fetch("https://holidays-jp.github.io/api/v1/date.json", requestInit);
  if (!res.ok) throw new Error("Failed to fetch Holidays JP API");

  const data = (await res.json()) as Record<string, string>;
  return Object.entries(data)
    .filter(([date]) => date >= startStr && date <= endStr)
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
