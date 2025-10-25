'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  normalizeUniversitySearchQuery,
  useUniversitySearch,
  type UniversitySearchEntry,
} from '@/lib/search/UniversitySearchContext';

function normalizeCandidate(value: string): string {
  return normalizeUniversitySearchQuery(value);
}

function getMatchTargets(entry: UniversitySearchEntry): string[] {
  return [
    entry.nameNormalized,
    entry.furiganaNormalized,
    normalizeCandidate(entry.shortName),
    normalizeCandidate(entry.prefecture),
    normalizeCandidate(entry.code),
  ];
}

type UniversitySearchBoxProps = {
  variant?: 'default' | 'header';
};

export function UniversitySearchBox({ variant = 'default' }: UniversitySearchBoxProps) {
  const { entries, loading, error, initialized } = useUniversitySearch();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const normalizedQuery = useMemo(
    () => normalizeUniversitySearchQuery(query),
    [query],
  );

  const { matchingEntries, totalMatchCount } = useMemo(() => {
    if (!normalizedQuery) {
      return { matchingEntries: [], totalMatchCount: 0 };
    }

    const matches = entries.filter((entry) =>
      getMatchTargets(entry).some((target) => target.includes(normalizedQuery)),
    );

    return {
      matchingEntries: matches.slice(0, 10),
      totalMatchCount: matches.length,
    };
  }, [entries, normalizedQuery]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      if (event.target instanceof Node && !element.contains(event.target)) {
        setOpen(false);
        setIsMobileExpanded(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (normalizedQuery) {
      setOpen(true);
    }
  }, [normalizedQuery]);

  const isHeaderVariant = variant === 'header';
  const containerClassName = isHeaderVariant
    ? `relative flex h-auto flex-col gap-1.5 transition-[width] duration-200 ${
        isMobileExpanded ? 'w-full sm:w-[22ch]' : 'w-11 sm:w-[22ch]'
      } ${isMobileExpanded ? 'z-[70] sm:z-auto' : ''}`
    : 'relative flex h-auto w-full flex-col gap-3';
  const labelClassName = isHeaderVariant
    ? `${
        isMobileExpanded ? 'flex' : 'hidden'
      } relative h-auto min-h-[2.75rem] w-full flex-col gap-0 sm:flex sm:min-h-0`
    : 'flex h-auto w-full flex-col gap-2';
  const inputWrapperClassName = isHeaderVariant
    ? `${
        isMobileExpanded
          ? 'absolute left-0 right-0 top-0 z-[90] flex h-12 w-full items-center sm:static sm:flex sm:h-12 sm:w-full sm:items-center'
          : 'hidden sm:flex sm:h-12 sm:w-full sm:items-center'
      }`
    : 'flex h-16 w-full items-center';
  const inputClassName = isHeaderVariant
    ? 'h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-inner transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'
    : 'h-14 w-full rounded-2xl border border-slate-200 bg-white px-6 text-base text-slate-900 shadow-inner transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

  const showResults = open && normalizedQuery.length > 0;
  const showEmptyState = showResults && totalMatchCount === 0 && initialized && !loading;

  return (
    <div ref={containerRef} className={containerClassName}>
      {isHeaderVariant && (
        <button
          type="button"
          onClick={() => {
            setIsMobileExpanded(true);
            setOpen(true);
            requestAnimationFrame(() => {
              inputRef.current?.focus();
            });
          }}
          aria-label="大学名で検索"
          className={`flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-inner transition hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:hidden ${
            isMobileExpanded ? 'hidden' : ''
          }`}
        >
          <i className="fa-solid fa-magnifying-glass text-base" />
        </button>
      )}
      <label className={labelClassName}>
        <div className={inputWrapperClassName}>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              setOpen(true);
              if (isHeaderVariant) {
                setIsMobileExpanded(true);
              }
            }}
            onBlur={() => {
              if (isHeaderVariant && !query) {
                setOpen(false);
                setIsMobileExpanded(false);
              }
            }}
            placeholder="大学名で検索"
            aria-label="大学名で検索"
            className={inputClassName}
            type="search"
          />
        </div>
      </label>
      {!initialized && loading && !error && null}
      {!isHeaderVariant && !loading && error && (
        <div className="h-auto w-full text-xs text-red-500">{error}</div>
      )}
      {isHeaderVariant && !loading && error && (
        <div className="h-auto w-full text-[0.65rem] text-red-500">{error}</div>
      )}
      {showResults && (
        <div className="absolute left-0 top-full z-[80] mt-2 flex h-72 w-full flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_48px_rgba(148,163,184,0.25)]">
          <div className="flex h-auto w-full items-center justify-between px-1 pb-2 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-slate-400">
            <span>Search Results</span>
            <span>
              {Math.min(totalMatchCount, matchingEntries.length)} / {totalMatchCount} 件表示
            </span>
          </div>
          {showEmptyState ? (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-500">
              該当する大学が見つかりませんでした。
            </div>
          ) : (
            <ul className="flex h-full w-full flex-col gap-1 overflow-y-auto">
              {matchingEntries.map((entry) => (
                <li key={entry.webId} className="w-full">
                  <button
                    type="button"
                    className="flex h-14 w-full flex-col justify-center rounded-xl bg-slate-50 px-4 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                    onClick={() => {
                      setOpen(false);
                      setIsMobileExpanded(false);
                      setQuery('');
                      router.push(`/calendars/${encodeURIComponent(entry.webId)}`);
                    }}
                  >
                    <span className="truncate font-semibold text-slate-900">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default UniversitySearchBox;
