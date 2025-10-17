'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CalendarDay, CalendarTerm } from '@/lib/data/schema/calendar';
import {
  getCalendarDays,
  getCalendarTerms,
} from '@/lib/data/service/calendar.service';
import {
  generateClassSchedule,
  type ClassScheduleItem,
} from '@/lib/data/service/class.service';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

type WeeklySlot = {
  dayOfWeek: number;
  period: number;
};

const DEFAULT_FISCAL_YEAR = '2025';
const DEFAULT_CALENDAR_ID = 'jd70dxbqvevcf5kj43cbaf4rjn7rs93e';
const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

export default function TimetableDebugPage() {
  const [fiscalYear, setFiscalYear] = useState(DEFAULT_FISCAL_YEAR);
  const [calendarId, setCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [terms, setTerms] = useState<CalendarTerm[]>([]);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedTermIds, setSelectedTermIds] = useState<string[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<WeeklySlot[]>([]);

  const [scheduleState, setScheduleState] = useState<LoadState>('idle');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [generatedDates, setGeneratedDates] = useState<ClassScheduleItem[]>([]);

  const selectableTerms = useMemo(
    () => terms.filter((term) => term.holidayFlag === 2),
    [terms],
  );

  const getCalendarWeekdayLabel = useCallback((date: string) => {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return '-';
    }
    const labels = ['日', '月', '火', '水', '木', '金', '土'] as const;
    return labels[parsed.getDay()] ?? '-';
  }, []);

  const periodNumbers = useMemo(() => {
    const numbers = Array.from(
      new Set(
        days
          .map((day) => day.classOrder)
          .filter(
            (period): period is number =>
              typeof period === 'number' && period > 0 && period <= 7,
          ),
      ),
    ).sort((a, b) => a - b);

    if (numbers.length > 0) {
      return numbers;
    }

    return [1, 2, 3, 4, 5, 6, 7];
  }, [days]);

  const baseCollectionPath = useMemo(() => {
    if (!fiscalYear || !calendarId) {
      return null;
    }
    return `calendars_${fiscalYear}/${calendarId}`;
  }, [calendarId, fiscalYear]);

  const handleLoadCalendar = useCallback(async () => {
    if (!fiscalYear.trim() || !calendarId.trim()) {
      setLoadError('年度とカレンダーIDを入力してください。');
      setLoadState('error');
      return;
    }

    try {
      setLoadState('loading');
      setLoadError(null);
      const [termItems, dayItems] = await Promise.all([
        getCalendarTerms(fiscalYear, calendarId),
        getCalendarDays(fiscalYear, calendarId),
      ]);
      setTerms(termItems);
      setDays(dayItems);
      setSelectedTermIds([]);
      setSelectedSlots([]);
      setGeneratedDates([]);
      setScheduleState('idle');
      setScheduleError(null);
      setLoadState('success');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'カレンダー情報の取得に失敗しました。';
      setLoadError(message);
      setLoadState('error');
    }
  }, [calendarId, fiscalYear]);

  const handleToggleTerm = useCallback((termId: string) => {
    setSelectedTermIds((prev) => {
      if (prev.includes(termId)) {
        return prev.filter((id) => id !== termId);
      }
      return [...prev, termId];
    });
  }, []);

  const handleToggleSlot = useCallback((slot: WeeklySlot) => {
    setSelectedSlots((prev) => {
      const key = `${slot.dayOfWeek}-${slot.period}`;
      const exists = prev.some(
        (item) => item.dayOfWeek === slot.dayOfWeek && item.period === slot.period,
      );
      if (exists) {
        return prev.filter((item) => `${item.dayOfWeek}-${item.period}` !== key);
      }
      return [...prev, slot];
    });
  }, []);

  const handleGenerateSchedule = useCallback(async () => {
    if (loadState !== 'success') {
      setScheduleError('カレンダー情報を先に取得してください。');
      setScheduleState('error');
      return;
    }

    if (selectedTermIds.length === 0) {
      setScheduleError('学期を選択してください。');
      setScheduleState('error');
      return;
    }

    const selectedDayNumbers = new Set(selectedSlots.map((slot) => slot.dayOfWeek));
    if (selectedDayNumbers.size === 0) {
      setScheduleError('曜日を少なくとも1つ選択してください。');
      setScheduleState('error');
      return;
    }

    try {
      setScheduleState('loading');
      setScheduleError(null);
      const results = await generateClassSchedule({
        fiscalYear,
        calendarId,
        termIds: selectedTermIds,
        weekdays: Array.from(selectedDayNumbers),
      });
      setGeneratedDates(results);
      setScheduleError(null);
      setScheduleState('success');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '授業日程の算出に失敗しました。';
      setScheduleError(message);
      setGeneratedDates([]);
      setScheduleState('error');
    }
  }, [calendarId, fiscalYear, loadState, selectedSlots, selectedTermIds]);

  useEffect(() => {
    void handleLoadCalendar();
  }, [handleLoadCalendar]);

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">授業作成デバッグ</h1>
        <p className="text-sm text-neutral-600">
          指定した年度・カレンダーの学期情報と授業日を取得し、選択した学期・曜日・時限から授業日程を算出します。
        </p>
        {baseCollectionPath ? (
          <p className="text-xs text-neutral-500">
            取得対象: <code>{baseCollectionPath}</code>
          </p>
        ) : null}
      </header>

      <section className="space-y-4 rounded border border-neutral-200 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-neutral-700">
            年度
            <input
              type="text"
              value={fiscalYear}
              onChange={(event) => setFiscalYear(event.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-neutral-700">
            カレンダーID
            <input
              type="text"
              value={calendarId}
              onChange={(event) => setCalendarId(event.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-base"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              void handleLoadCalendar();
            }}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-400"
            disabled={loadState === 'loading'}
          >
            {loadState === 'loading' ? 'カレンダー情報を取得中…' : 'カレンダー情報を再取得'}
          </button>
        </div>
        {loadError ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">学期選択</h2>
          <p className="text-sm text-neutral-600">
            Firestore の calendar_terms コレクションから取得した学期を表示しています。
          </p>
        </header>
        {selectableTerms.length === 0 ? (
          <p className="text-sm text-neutral-500">対象となる学期が取得できていません。</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {selectableTerms.map((term) => {
              const checked = selectedTermIds.includes(term.id);
              return (
                <label
                  key={term.id}
                  className="flex cursor-pointer items-start gap-2 rounded border border-neutral-200 p-3 text-sm hover:border-neutral-300"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleTerm(term.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-neutral-800">{term.name}</span>
                    {term.shortName ? (
                      <span className="text-xs text-neutral-500">短縮名: {term.shortName}</span>
                    ) : null}
                    {typeof term.order === 'number' ? (
                      <span className="block text-xs text-neutral-500">表示順: {term.order}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">曜日・時限選択</h2>
          <p className="text-sm text-neutral-600">
            横軸が曜日、縦軸が時限のグリッドを選択して週次枠を設定します。
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-neutral-200 text-center text-sm">
            <thead className="bg-neutral-100">
              <tr>
                <th className="border border-neutral-200 px-2 py-1">時限</th>
                {WEEKDAY_LABELS.map((label) => (
                  <th key={label} className="border border-neutral-200 px-3 py-1">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodNumbers.map((period) => (
                <tr key={period}>
                  <th className="border border-neutral-200 px-2 py-1 text-left font-semibold">
                    {period}限
                  </th>
                  {WEEKDAY_LABELS.map((_, index) => {
                    const dayOfWeek = index + 1;
                    const isSelected = selectedSlots.some(
                      (slot) => slot.dayOfWeek === dayOfWeek && slot.period === period,
                    );
                    return (
                      <td key={`${dayOfWeek}-${period}`} className="border border-neutral-200 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => handleToggleSlot({ dayOfWeek, period })}
                          className={`flex h-10 w-full items-center justify-center rounded text-sm font-medium transition-colors ${
                            isSelected
                              ? 'bg-neutral-900 text-white'
                              : 'bg-white text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          {isSelected ? '選択中' : '選択'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-sm text-neutral-600">
          選択済み: {selectedSlots.length}{' '}
          件（例: {selectedSlots
            .map((slot) => `${WEEKDAY_LABELS[slot.dayOfWeek - 1]}曜${slot.period}限`)
            .join(', ') || 'なし'}）
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">授業日程算出</h2>
            <p className="text-sm text-neutral-600">
              選択した学期・曜日・時限に一致する授業日をカレンダーから抽出します。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleGenerateSchedule();
            }}
            className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-400"
            disabled={loadState !== 'success'}
          >
            授業日程を算出
          </button>
        </header>
        {scheduleError ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {scheduleError}
          </p>
        ) : null}
        {scheduleState === 'loading' ? (
          <p className="text-sm text-neutral-500">授業日程を算出中です…</p>
        ) : null}
        {scheduleState === 'success' ? (
          generatedDates.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">
                {generatedDates.length} 件の授業日が見つかりました。
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-neutral-200 text-left text-sm">
                  <thead className="bg-neutral-100">
                    <tr>
                      <th className="border border-neutral-200 px-3 py-2">日付</th>
                      <th className="border border-neutral-200 px-3 py-2">曜日</th>
                      <th className="border border-neutral-200 px-3 py-2">回数</th>
                      <th className="border border-neutral-200 px-3 py-2">学期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedDates.map((item) => (
                      <tr key={`${item.date}-${item.classWeekday ?? 'na'}-${item.period ?? 'na'}`}>
                        <td className="border border-neutral-200 px-3 py-2 font-mono">{item.date}</td>
                        <td className="border border-neutral-200 px-3 py-2">
                          {item.date ? `${getCalendarWeekdayLabel(item.date)}曜` : '-'}
                        </td>
                        <td className="border border-neutral-200 px-3 py-2">
                          {typeof item.period === 'number' ? item.period : '-'}
                        </td>
                        <td className="border border-neutral-200 px-3 py-2">{item.termName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">一致する授業日は見つかりませんでした。</p>
          )
        ) : null}
      </section>
    </div>
  );
}
