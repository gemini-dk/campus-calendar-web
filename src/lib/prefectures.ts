export type PrefectureDefinition = {
  slug: string;
  name: string;
  shortName: string;
  englishName: string;
  aliases?: string[];
};

export const PREFECTURES: PrefectureDefinition[] = [
  { slug: 'hokkaido', name: '北海道', shortName: '北海道', englishName: 'Hokkaido' },
  { slug: 'aomori', name: '青森県', shortName: '青森', englishName: 'Aomori' },
  { slug: 'iwate', name: '岩手県', shortName: '岩手', englishName: 'Iwate' },
  { slug: 'miyagi', name: '宮城県', shortName: '宮城', englishName: 'Miyagi' },
  { slug: 'akita', name: '秋田県', shortName: '秋田', englishName: 'Akita' },
  { slug: 'yamagata', name: '山形県', shortName: '山形', englishName: 'Yamagata' },
  { slug: 'fukushima', name: '福島県', shortName: '福島', englishName: 'Fukushima' },
  { slug: 'ibaraki', name: '茨城県', shortName: '茨城', englishName: 'Ibaraki' },
  { slug: 'tochigi', name: '栃木県', shortName: '栃木', englishName: 'Tochigi' },
  { slug: 'gunma', name: '群馬県', shortName: '群馬', englishName: 'Gunma' },
  { slug: 'saitama', name: '埼玉県', shortName: '埼玉', englishName: 'Saitama' },
  { slug: 'chiba', name: '千葉県', shortName: '千葉', englishName: 'Chiba' },
  { slug: 'tokyo', name: '東京都', shortName: '東京', englishName: 'Tokyo', aliases: ['東京', 'Tokyo Metropolis'] },
  { slug: 'kanagawa', name: '神奈川県', shortName: '神奈川', englishName: 'Kanagawa' },
  { slug: 'niigata', name: '新潟県', shortName: '新潟', englishName: 'Niigata' },
  { slug: 'toyama', name: '富山県', shortName: '富山', englishName: 'Toyama' },
  { slug: 'ishikawa', name: '石川県', shortName: '石川', englishName: 'Ishikawa' },
  { slug: 'fukui', name: '福井県', shortName: '福井', englishName: 'Fukui' },
  { slug: 'yamanashi', name: '山梨県', shortName: '山梨', englishName: 'Yamanashi' },
  { slug: 'nagano', name: '長野県', shortName: '長野', englishName: 'Nagano' },
  { slug: 'gifu', name: '岐阜県', shortName: '岐阜', englishName: 'Gifu' },
  { slug: 'shizuoka', name: '静岡県', shortName: '静岡', englishName: 'Shizuoka' },
  { slug: 'aichi', name: '愛知県', shortName: '愛知', englishName: 'Aichi' },
  { slug: 'mie', name: '三重県', shortName: '三重', englishName: 'Mie' },
  { slug: 'shiga', name: '滋賀県', shortName: '滋賀', englishName: 'Shiga' },
  { slug: 'kyoto', name: '京都府', shortName: '京都', englishName: 'Kyoto', aliases: ['京都', 'Kyoto Prefecture'] },
  { slug: 'osaka', name: '大阪府', shortName: '大阪', englishName: 'Osaka', aliases: ['大阪', 'Osaka Prefecture'] },
  { slug: 'hyogo', name: '兵庫県', shortName: '兵庫', englishName: 'Hyogo' },
  { slug: 'nara', name: '奈良県', shortName: '奈良', englishName: 'Nara' },
  { slug: 'wakayama', name: '和歌山県', shortName: '和歌山', englishName: 'Wakayama' },
  { slug: 'tottori', name: '鳥取県', shortName: '鳥取', englishName: 'Tottori' },
  { slug: 'shimane', name: '島根県', shortName: '島根', englishName: 'Shimane' },
  { slug: 'okayama', name: '岡山県', shortName: '岡山', englishName: 'Okayama' },
  { slug: 'hiroshima', name: '広島県', shortName: '広島', englishName: 'Hiroshima' },
  { slug: 'yamaguchi', name: '山口県', shortName: '山口', englishName: 'Yamaguchi' },
  { slug: 'tokushima', name: '徳島県', shortName: '徳島', englishName: 'Tokushima' },
  { slug: 'kagawa', name: '香川県', shortName: '香川', englishName: 'Kagawa' },
  { slug: 'ehime', name: '愛媛県', shortName: '愛媛', englishName: 'Ehime' },
  { slug: 'kochi', name: '高知県', shortName: '高知', englishName: 'Kochi' },
  { slug: 'fukuoka', name: '福岡県', shortName: '福岡', englishName: 'Fukuoka' },
  { slug: 'saga', name: '佐賀県', shortName: '佐賀', englishName: 'Saga' },
  { slug: 'nagasaki', name: '長崎県', shortName: '長崎', englishName: 'Nagasaki' },
  { slug: 'kumamoto', name: '熊本県', shortName: '熊本', englishName: 'Kumamoto' },
  { slug: 'oita', name: '大分県', shortName: '大分', englishName: 'Oita' },
  { slug: 'miyazaki', name: '宮崎県', shortName: '宮崎', englishName: 'Miyazaki' },
  { slug: 'kagoshima', name: '鹿児島県', shortName: '鹿児島', englishName: 'Kagoshima' },
  { slug: 'okinawa', name: '沖縄県', shortName: '沖縄', englishName: 'Okinawa' },
];

const PREFECTURE_MAP = new Map(PREFECTURES.map((prefecture) => [prefecture.slug, prefecture] as const));

function normalizePrefectureCandidate(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function stripSuffix(value: string): string {
  return value.replace(/(都|道|府|県)$/u, '');
}

export function getPrefectureBySlug(slug: string): PrefectureDefinition | undefined {
  return PREFECTURE_MAP.get(slug);
}

export function listPrefectureSlugs(): string[] {
  return PREFECTURES.map((prefecture) => prefecture.slug);
}

export function matchesPrefecture(candidate: unknown, prefecture: PrefectureDefinition): boolean {
  const normalizedCandidate = normalizePrefectureCandidate(candidate);
  if (!normalizedCandidate) {
    return false;
  }

  const candidates = new Set<string>();
  const push = (value?: string) => {
    if (!value) {
      return;
    }
    const normalized = normalizePrefectureCandidate(value);
    if (normalized) {
      candidates.add(normalized);
      const withoutSuffix = stripSuffix(normalized);
      if (withoutSuffix) {
        candidates.add(withoutSuffix);
      }
    }
  };

  push(prefecture.name);
  push(prefecture.shortName);
  push(prefecture.slug);
  push(prefecture.englishName);
  prefecture.aliases?.forEach(push);

  const candidateWithoutSuffix = stripSuffix(normalizedCandidate);

  return candidates.has(normalizedCandidate) || candidates.has(candidateWithoutSuffix);
}
