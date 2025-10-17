'use client';

import { useMemo, useState } from 'react';
import {
  importCalendarToFirestore,
  searchCalendarsByUniversity,
  type CalendarImportSummary,
  type CalendarSearchResult,
} from '@/lib/calendarImporter';

type CalendarImportDialogProps = {
  userId: string;
  onClose: () => void;
  onImported: (summary: CalendarImportSummary) => void;
};

type GroupedCalendars = Array<{
  universityName: string;
  calendars: CalendarSearchResult[];
}>;

export function CalendarImportDialog({ userId, onClose, onImported }: CalendarImportDialogProps) {
  const [keyword, setKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CalendarSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<CalendarSearchResult['calendarId'] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const groupedCalendars = useMemo<GroupedCalendars>(() => {
    const groups = new Map<string, CalendarSearchResult[]>();
    searchResults.forEach((calendar) => {
      const key = calendar.universityName || '大学名未設定';
      const existing = groups.get(key);
      if (existing) {
        existing.push(calendar);
      } else {
        groups.set(key, [calendar]);
      }
    });
    return Array.from(groups.entries())
      .map(([universityName, calendars]) => ({
        universityName,
        calendars: calendars.sort((a, b) => a.name.localeCompare(b.name, 'ja')),
      }))
      .sort((a, b) => a.universityName.localeCompare(b.universityName, 'ja'));
  }, [searchResults]);

  const fiscalYear = useMemo(() => new Date().getFullYear(), []);

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchError(null);
    setImportError(null);
    try {
      const trimmed = keyword.trim();
      if (!trimmed) {
        setSearchResults([]);
        return;
      }
      const calendars = await searchCalendarsByUniversity(trimmed, fiscalYear, {
        includeUnpublishable: false,
      });
      setSearchResults(calendars);
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : '大学情報の検索中にエラーが発生しました。'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCalendar = async (calendar: CalendarSearchResult) => {
    setImportError(null);
    setImportingId(calendar.calendarId);
    try {
      const summary = await importCalendarToFirestore({
        userId,
        calendarId: calendar.calendarId,
      });
      onImported(summary);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'Firestore への取り込み中にエラーが発生しました。'
      );
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">大学の学事予定を検索</h2>
            <p className="mt-1 text-sm text-white/70">Convex 上の大学カレンダーを検索して取り込みます。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/60 hover:text-white"
          >
            閉じる
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-sm font-medium text-white">大学名で検索</h3>
            <p className="mt-1 text-xs text-white/60">大学名の一部を入力して検索してください。</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="例: 東京大学"
                className="w-full rounded-full border border-white/20 bg-slate-900/70 px-4 py-3 text-sm text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching}
                className="inline-flex w-full items-center justify-center rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                {isSearching ? '検索中…' : '検索する'}
              </button>
            </div>
            {searchError ? (
              <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-xs text-red-100">{searchError}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-sm font-medium text-white">検索結果</h3>
            {groupedCalendars.length === 0 ? (
              <p className="mt-3 text-xs text-white/60">検索結果がここに表示されます。</p>
            ) : (
              <div className="mt-4 space-y-5">
                {groupedCalendars.map((group) => (
                  <div key={group.universityName} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold text-white">{group.universityName}</h4>
                    <ul className="mt-3 space-y-3">
                      {group.calendars.map((calendar) => (
                        <li key={calendar.calendarId}>
                          <button
                            type="button"
                            onClick={() => handleSelectCalendar(calendar)}
                            disabled={importingId === calendar.calendarId}
                            className="flex w-full flex-col rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left text-sm text-white transition hover:border-sky-400/60 hover:bg-sky-500/10 disabled:cursor-wait disabled:border-sky-400/40"
                          >
                            <span className="font-semibold">{calendar.name}</span>
                            <span className="mt-1 text-xs text-white/70">
                              {calendar.fiscalYear}年度 / ダウンロード {calendar.downloadCount} 回
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {importError ? (
              <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-xs text-red-100">{importError}</p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
