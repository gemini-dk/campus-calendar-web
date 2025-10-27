import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/firestore';

import {
  universityCalendarSchema,
  universitySchema,
  type University,
  type UniversityCalendar,
} from '../schema/university';
import {
  universitySearchEntrySchema,
  type UniversitySearchEntry,
} from '../schema/university-search';

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value.replaceAll(',', ''));
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item));
    return normalized.length > 0 ? normalized : undefined;
  }
  const normalized = normalizeString(value);
  if (normalized) {
    return [normalized];
  }
  return undefined;
}

function coerceUniversityData(id: string, data: unknown): University | null {
  const record = typeof data === 'object' && data !== null ? data : {};
  const nameCandidate =
    normalizeString((record as { name?: unknown }).name)
      || normalizeString((record as { displayName?: unknown }).displayName)
      || normalizeString((record as { fullName?: unknown }).fullName);
  const webIdCandidate =
    normalizeString((record as { webId?: unknown }).webId)
      || normalizeString((record as { webID?: unknown }).webID)
      || normalizeString((record as { slug?: unknown }).slug);
  if (!nameCandidate || !webIdCandidate) {
    return null;
  }
  const capacityCandidate = normalizeNumber((record as { capacity?: unknown }).capacity);
  const homepageCandidate = normalizeString((record as { homepageUrl?: unknown }).homepageUrl);
  const codeCandidate = normalizeString((record as { code?: unknown }).code);
  const facultiesCandidate = normalizeStringArray((record as { faculties?: unknown }).faculties);
  const campusesCandidate = normalizeStringArray((record as { campuses?: unknown }).campuses);

  const candidate = {
    id,
    ...record,
    name: nameCandidate,
    webId: webIdCandidate,
    capacity: capacityCandidate,
    homepageUrl: homepageCandidate || undefined,
    code: codeCandidate || undefined,
    faculties: facultiesCandidate,
    campuses: campusesCandidate,
  } satisfies Partial<University> & { id: string };

  try {
    return universitySchema.parse(candidate);
  } catch (error) {
    console.error('大学ドキュメントのパースに失敗しました', error, candidate);
    return null;
  }
}

function resolveFurigana(record: unknown, fallback: string): string {
  const candidateSources: unknown[] = [];
  if (record && typeof record === 'object') {
    const candidateRecord = record as Record<string, unknown>;
    candidateSources.push(
      candidateRecord.furigana,
      candidateRecord.furi,
      candidateRecord.nameFurigana,
      candidateRecord.nameKana,
      candidateRecord.nameRuby,
      candidateRecord.yomi,
      candidateRecord.reading,
      candidateRecord.kana,
      candidateRecord.kanaName,
    );
  }

  for (const source of candidateSources) {
    const normalized = normalizeString(source);
    if (normalized) {
      return normalized;
    }
  }

  const normalizedFallback = normalizeString(fallback);
  return normalizedFallback || '';
}

export async function listUniversitySearchEntries(): Promise<UniversitySearchEntry[]> {
  const universitiesRef = collection(db, 'universities');
  const snapshot = await getDocs(universitiesRef);

  const entries: UniversitySearchEntry[] = [];

  snapshot.docs.forEach((docSnap) => {
    const base = coerceUniversityData(docSnap.id, docSnap.data());
    if (!base) {
      return;
    }

    const furigana = resolveFurigana(docSnap.data(), base.name);
    const candidate = {
      name: base.name,
      webId: base.webId,
      furigana: furigana || base.name,
    } satisfies UniversitySearchEntry;

    const parsed = universitySearchEntrySchema.safeParse(candidate);
    if (!parsed.success) {
      console.error('大学検索エントリのパースに失敗しました', parsed.error, candidate);
      return;
    }

    entries.push(parsed.data);
  });

  entries.sort((a, b) => {
    const furiganaA = a.furigana || a.name;
    const furiganaB = b.furigana || b.name;
    const compare = furiganaA.localeCompare(furiganaB, 'ja');
    if (compare !== 0) {
      return compare;
    }
    return a.name.localeCompare(b.name, 'ja');
  });

  return entries;
}

function coerceCalendarData(
  id: string,
  data: unknown,
  defaultFiscalYear: string,
): UniversityCalendar | null {
  const record = typeof data === 'object' && data !== null ? data : {};
  const nameCandidate =
    normalizeString((record as { name?: unknown }).name)
      || normalizeString((record as { title?: unknown }).title)
      || normalizeString((record as { displayName?: unknown }).displayName);
  const calendarIdCandidate =
    normalizeString(id)
      || normalizeString((record as { calendarId?: unknown }).calendarId)
      || normalizeString((record as { id?: unknown }).id);
  const fiscalYearCandidate =
    normalizeString((record as { fiscalYear?: unknown }).fiscalYear)
      || defaultFiscalYear;

  if (!nameCandidate || !calendarIdCandidate || !fiscalYearCandidate) {
    return null;
  }

  const orderCandidate = normalizeNumber((record as { order?: unknown }).order);
  const hasSaturdayRaw = (record as { hasSaturdayClasses?: unknown }).hasSaturdayClasses;
  const hasSaturdayClasses = typeof hasSaturdayRaw === 'boolean' ? hasSaturdayRaw : undefined;
  const noteCandidate = normalizeString((record as { note?: unknown }).note);

  const candidate = {
    id,
    ...record,
    name: nameCandidate,
    calendarId: calendarIdCandidate,
    fiscalYear: fiscalYearCandidate,
    hasSaturdayClasses,
    order: orderCandidate,
    note: noteCandidate || undefined,
  } satisfies Partial<UniversityCalendar> & { id: string };

  try {
    return universityCalendarSchema.parse(candidate);
  } catch (error) {
    console.error('大学カレンダードキュメントのパースに失敗しました', error, candidate);
    return null;
  }
}

const LIST_UNIVERSITIES_BATCH_SIZE = 200;

type UniversityDocumentSnapshot = QueryDocumentSnapshot<DocumentData>;

export async function listUniversities(): Promise<University[]> {
  const universitiesRef = collection(db, 'universities');
  const allDocs: UniversityDocumentSnapshot[] = [];

  let cursor: UniversityDocumentSnapshot | undefined;
  // Firestoreの1リクエストあたりのレスポンスサイズ上限（約1MB）を考慮し、
  // 複数回に分けて全ドキュメントを取得する。
  while (true) {
    const constraints: QueryConstraint[] = [
      orderBy(documentId()),
      limit(LIST_UNIVERSITIES_BATCH_SIZE),
    ];
    if (cursor) {
      constraints.push(startAfter(cursor));
    }
    const paginatedQuery = query(universitiesRef, ...constraints);
    const snapshot = await getDocs(paginatedQuery);

    if (snapshot.empty) {
      break;
    }

    allDocs.push(...snapshot.docs);

    if (snapshot.size < LIST_UNIVERSITIES_BATCH_SIZE) {
      break;
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  return allDocs
    .map((docSnap) => coerceUniversityData(docSnap.id, docSnap.data()))
    .filter((item): item is University => item !== null)
    .sort((a, b) => {
      const capacityA = typeof a.capacity === 'number' ? a.capacity : -1;
      const capacityB = typeof b.capacity === 'number' ? b.capacity : -1;
      if (capacityA !== capacityB) {
        return capacityB - capacityA;
      }
      return a.name.localeCompare(b.name, 'ja');
    });
}

export async function getUniversityByWebId(webId: string): Promise<University | null> {
  const trimmedId = webId.trim();
  if (!trimmedId) {
    return null;
  }
  const universitiesRef = collection(db, 'universities');
  const universitiesQuery = query(universitiesRef, where('webId', '==', trimmedId));
  const snapshot = await getDocs(universitiesQuery);
  if (snapshot.empty) {
    return null;
  }
  const parsed = coerceUniversityData(snapshot.docs[0].id, snapshot.docs[0].data());
  return parsed;
}

async function listCalendarsFromYearCollection(
  universityCode: string,
  fiscalYear: string,
): Promise<UniversityCalendar[]> {
  const collectionName = `calendars_${fiscalYear}`;
  const calendarsRef = collection(db, collectionName);
  const calendarsQuery = query(
    calendarsRef,
    where('universityCode', '==', universityCode),
    where('isPublishable', '==', true),
  );
  const snapshot = await getDocs(calendarsQuery);

  const calendars = snapshot.docs
    .map((docSnap) => coerceCalendarData(docSnap.id, docSnap.data(), fiscalYear))
    .filter((item): item is UniversityCalendar => item !== null && item.fiscalYear === fiscalYear);

  return calendars;
}

async function listCalendarsFromSubcollection(
  universityId: string,
  fiscalYear: string,
): Promise<UniversityCalendar[]> {
  const calendarsRef = collection(db, 'universities', universityId, 'calendars');
  const snapshot = await getDocs(calendarsRef);

  const calendars = snapshot.docs
    .map((docSnap) => coerceCalendarData(docSnap.id, docSnap.data(), fiscalYear))
    .filter((item): item is UniversityCalendar => item !== null && item.fiscalYear === fiscalYear);
  return calendars;
}

async function listCalendarsFromDocument(
  universityId: string,
  fiscalYear: string,
): Promise<UniversityCalendar[]> {
  const universityRef = doc(db, 'universities', universityId);
  const universitySnapshot = await getDoc(universityRef);
  if (!universitySnapshot.exists()) {
    return [];
  }
  const data = universitySnapshot.data();
  const directCalendars = (data as { calendars?: unknown }).calendars;
  const calendars: UniversityCalendar[] = [];

  if (Array.isArray(directCalendars)) {
    directCalendars.forEach((item, index) => {
      const parsed = coerceCalendarData(String(index), item, fiscalYear);
      if (parsed && parsed.fiscalYear === fiscalYear) {
        calendars.push(parsed);
      }
    });
  }

  const fiscalYearsRecord = (data as { fiscalYears?: Record<string, unknown> }).fiscalYears;
  if (fiscalYearsRecord && typeof fiscalYearsRecord === 'object') {
    const fiscalEntry = (fiscalYearsRecord as Record<string, unknown>)[fiscalYear];
    if (fiscalEntry && typeof fiscalEntry === 'object') {
      const entryCalendars = (fiscalEntry as { calendars?: unknown }).calendars;
      if (Array.isArray(entryCalendars)) {
        entryCalendars.forEach((item, index) => {
          const parsed = coerceCalendarData(`fy-${index}`, item, fiscalYear);
          if (parsed && parsed.fiscalYear === fiscalYear) {
            calendars.push(parsed);
          }
        });
      }
    }
  }

  return calendars;
}

export async function listUniversityCalendars(
  university: Pick<University, 'id' | 'code'>,
  fiscalYear: string,
): Promise<UniversityCalendar[]> {
  if (university.code) {
    const fromYearCollection = await listCalendarsFromYearCollection(university.code, fiscalYear);
    if (fromYearCollection.length > 0) {
      return fromYearCollection.sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
        const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.name.localeCompare(b.name, 'ja');
      });
    }
  }

  const fromSubcollection = await listCalendarsFromSubcollection(university.id, fiscalYear);
  if (fromSubcollection.length > 0) {
    return fromSubcollection.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name, 'ja');
    });
  }

  const fromDocument = await listCalendarsFromDocument(university.id, fiscalYear);
  return fromDocument.sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.name.localeCompare(b.name, 'ja');
  });
}
