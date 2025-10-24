'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const CACHE_VERSION = '20250101';
const STORAGE_KEY = `campusCalendar.universitySearch.${CACHE_VERSION}`;
const API_ENDPOINT = '/api/university-search';

export type UniversitySearchEntry = {
  webId: string;
  name: string;
  furigana: string;
  shortName: string;
  prefecture: string;
  code: string;
  nameNormalized: string;
  furiganaNormalized: string;
};

export type UniversitySearchContextValue = {
  entries: UniversitySearchEntry[];
  loading: boolean;
  initialized: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const UniversitySearchContext =
  createContext<UniversitySearchContextValue | undefined>(undefined);

function ensureString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function normalizeForSearch(value: string): string {
  return value ? value.normalize('NFKC').replace(/\s+/g, '').toLowerCase() : '';
}

function coerceEntry(raw: unknown): UniversitySearchEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const name = ensureString(record.name);
  if (!name) {
    return null;
  }

  const webId = ensureString(
    record.webId
      ?? (record as { webID?: unknown }).webID
      ?? (record as { slug?: unknown }).slug,
  );
  if (!webId) {
    return null;
  }

  const furigana =
    ensureString(record.furigana ?? record.nameKana ?? record.kana) || name;
  const shortName = ensureString(record.shortName ?? record.alias);
  const prefecture = ensureString(record.prefecture ?? record.location);
  const code = ensureString(record.code ?? record.universityCode);

  return {
    webId,
    name,
    furigana,
    shortName,
    prefecture,
    code,
    nameNormalized: normalizeForSearch(name),
    furiganaNormalized: normalizeForSearch(furigana),
  };
}

function parseEntries(raw: unknown): UniversitySearchEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized: UniversitySearchEntry[] = [];
  raw.forEach((item) => {
    const entry = coerceEntry(item);
    if (entry) {
      normalized.push(entry);
    }
  });
  return normalized;
}

function loadCache(): UniversitySearchEntry[] | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as unknown;
    const entries = parseEntries((parsed as { entries?: unknown }).entries);
    return entries.length > 0 ? entries : null;
  } catch (error) {
    console.error('Failed to parse university search cache', error);
    return null;
  }
}

function saveCache(entries: UniversitySearchEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const payload = JSON.stringify({ entries });
    window.sessionStorage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    console.error('Failed to persist university search cache', error);
  }
}

async function requestEntries(signal?: AbortSignal): Promise<UniversitySearchEntry[]> {
  const response = await fetch(API_ENDPOINT, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to load university search entries: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return parseEntries(payload);
}

export function normalizeUniversitySearchQuery(value: string): string {
  return normalizeForSearch(value);
}

export function UniversitySearchProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<UniversitySearchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const cached = loadCache();
    if (cached) {
      setEntries(cached);
      setInitialized(true);
    }

    const controller = new AbortController();

    (async () => {
      setLoading(true);
      try {
        const fresh = await requestEntries(controller.signal);
        if (!active) {
          return;
        }
        setEntries(fresh);
        saveCache(fresh);
        setError(null);
        setInitialized(true);
      } catch (cause) {
        if (!active) {
          return;
        }
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch university search entries', cause);
        setError('大学検索データの取得に失敗しました。');
        if (!cached) {
          setInitialized(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await requestEntries();
      setEntries(fresh);
      saveCache(fresh);
      setInitialized(true);
    } catch (cause) {
      console.error('Failed to refresh university search entries', cause);
      setError('大学検索データの取得に失敗しました。');
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({ entries, loading, initialized, error, refresh }),
    [entries, loading, initialized, error, refresh],
  );

  return (
    <UniversitySearchContext.Provider value={value}>
      {children}
    </UniversitySearchContext.Provider>
  );
}

export function useUniversitySearch(): UniversitySearchContextValue {
  const context = useContext(UniversitySearchContext);
  if (!context) {
    throw new Error('useUniversitySearch must be used within UniversitySearchProvider');
  }
  return context;
}
