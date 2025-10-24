import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/firestore';

import {
  universityCalendarSchema,
  universitySchema,
  type University,
  type UniversityCalendar,
} from '../schema/university';

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

function normalizeRgbComponents(components: unknown[]): string | undefined {
  if (components.length !== 3) {
    return undefined;
  }

  const normalized: string[] = [];
  for (const component of components) {
    let numericValue: number | null = null;
    if (typeof component === 'number' && Number.isFinite(component)) {
      numericValue = component;
    } else if (typeof component === 'string') {
      const trimmed = component.trim();
      if (!trimmed) {
        return undefined;
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed)) {
        numericValue = parsed;
      }
    }

    if (numericValue === null) {
      return undefined;
    }

    const rounded = Math.round(numericValue);
    if (rounded < 0 || rounded > 255) {
      return undefined;
    }

    normalized.push(String(rounded));
  }

  return normalized.join(',');
}

function normalizeColorRgb(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const stripped = trimmed.replace(/^"+|"+$/g, '');
    const parts = stripped.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
    return normalizeRgbComponents(parts);
  }

  if (Array.isArray(value)) {
    return normalizeRgbComponents(value);
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as { r?: unknown; g?: unknown; b?: unknown };
    const parts = [record.r, record.g, record.b].filter((part) => part !== undefined);
    if (parts.length === 3) {
      return normalizeRgbComponents(parts);
    }
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
  const colorCandidate = normalizeColorRgb((record as { colorRgb?: unknown }).colorRgb);

  const candidate = {
    id,
    ...record,
    name: nameCandidate,
    webId: webIdCandidate,
    capacity: capacityCandidate,
    homepageUrl: homepageCandidate || undefined,
    code: codeCandidate || undefined,
    colorRgb: colorCandidate,
  } satisfies Partial<University> & { id: string };

  try {
    return universitySchema.parse(candidate);
  } catch (error) {
    console.error('大学ドキュメントのパースに失敗しました', error, candidate);
    return null;
  }
}

export type UniversityColorUpdate = {
  universityId: string;
  colorRgb: string;
};

export async function updateUniversityColors(updates: UniversityColorUpdate[]): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const batch = writeBatch(db);

  updates.forEach(({ universityId, colorRgb }) => {
    const normalized = normalizeColorRgb(colorRgb);
    if (!normalized) {
      throw new Error(`colorRgb の形式が不正です: ${colorRgb}`);
    }
    const ref = doc(db, 'universities', universityId);
    batch.update(ref, { colorRgb: normalized });
  });

  await batch.commit();
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

export async function listUniversities(): Promise<University[]> {
  const universitiesRef = collection(db, 'universities');
  const snapshot = await getDocs(universitiesRef);

  return snapshot.docs
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
  const calendarsQuery = query(calendarsRef, where('universityCode', '==', universityCode));
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
