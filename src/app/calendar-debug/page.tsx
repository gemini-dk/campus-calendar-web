'use client';

import { useCallback, useMemo, useState } from 'react';

import type { CalendarDay, CalendarTerm } from '@/lib/data/schema/calendar';
import {
  getCalendarDays,
  getCalendarTerms,
} from '@/lib/data/service/calendar.service';
import {
  getCalendarDisplayInfo,
  type CalendarDisplayInfo,
} from '@/lib/data/service/calendarDisplay.service';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

export default function CalendarDebugPage() {
  const [fiscalYear, setFiscalYear] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [terms, setTerms] = useState<CalendarTerm[] | null>(null);
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [termsState, setTermsState] = useState<LoadState>('idle');
  const [daysState, setDaysState] = useState<LoadState>('idle');
  const [displayState, setDisplayState] = useState<LoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [displayDate, setDisplayDate] = useState('');
  const [displayInfo, setDisplayInfo] = useState<CalendarDisplayInfo | null>(null);

  const baseCollectionPath = useMemo(() => {
    if (!fiscalYear || !calendarId) {
      return null;
    }
    return `calendars_${fiscalYear}/${calendarId}`;
  }, [fiscalYear, calendarId]);

  const handleFetchTerms = useCallback(() => {
    setTermsState('loading');
    void getCalendarTerms(fiscalYear, calendarId)
      .then((items) => {
        setTerms(items);
        setTermsState('success');
        setErrorMessage(null);
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : '不明なエラーが発生しました。';
        setErrorMessage(message);
        setTerms([]);
        setTermsState('error');
      });
  }, [calendarId, fiscalYear]);

  const handleFetchDays = useCallback(() => {
    setDaysState('loading');
    void getCalendarDays(fiscalYear, calendarId)
      .then((items) => {
        setDays(items);
        setDaysState('success');
        setErrorMessage(null);
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : '不明なエラーが発生しました。';
        setErrorMessage(message);
        setDays([]);
        setDaysState('error');
      });
  }, [calendarId, fiscalYear]);

  const handleFetchDisplay = useCallback(() => {
    if (!fiscalYear || !calendarId || !displayDate) {
      setErrorMessage('年度、カレンダーID、日付を入力してください。');
      setDisplayState('error');
      return;
    }

    setDisplayState('loading');
    void getCalendarDisplayInfo(fiscalYear, calendarId, displayDate)
      .then((result) => {
        setDisplayInfo(result);
        setDisplayState('success');
        setErrorMessage(null);
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : '不明なエラーが発生しました。';
        setErrorMessage(message);
        setDisplayInfo(null);
        setDisplayState('error');
      });
  }, [calendarId, displayDate, fiscalYear]);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Firestore カレンダー確認</h1>
        <p className="text-sm text-neutral-600">
          `schema.md` で定義されたカレンダーデータを{' '}
          <code className="rounded bg-neutral-100 px-1 py-0.5">
            /calendars_&#123;年度&#125;/&#123;calendar_id&#125;
          </code>{' '}
          から取得します。
        </p>
        {baseCollectionPath ? (
          <p className="text-xs text-neutral-500">
            取得対象: <code>{baseCollectionPath}</code>
          </p>
        ) : null}
      </header>

      <section className="space-y-4 rounded border border-neutral-200 p-4">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-neutral-700">
            年度
            <input
              type="text"
              value={fiscalYear}
              onChange={(event) => setFiscalYear(event.target.value.trim())}
              placeholder="例: 2024"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-base"
            />
          </label>

          <label className="block text-sm font-medium text-neutral-700">
            カレンダーID
            <input
              type="text"
              value={calendarId}
              onChange={(event) => setCalendarId(event.target.value.trim())}
              placeholder="例: campus-calendar-001"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-base"
            />
          </label>

          <label className="block text-sm font-medium text-neutral-700">
            日付
            <input
              type="date"
              value={displayDate}
              onChange={(event) => setDisplayDate(event.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-base"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleFetchTerms}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-400"
            disabled={termsState === 'loading'}
          >
            {termsState === 'loading' ? '期間一覧取得中…' : '期間一覧を取得'}
          </button>
          <button
            type="button"
            onClick={handleFetchDays}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-400"
            disabled={daysState === 'loading'}
          >
            {daysState === 'loading' ? '日付一覧取得中…' : '日付一覧を取得'}
          </button>
          <button
            type="button"
            onClick={handleFetchDisplay}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-400"
            disabled={displayState === 'loading'}
          >
            {displayState === 'loading' ? '日付表示情報取得中…' : '日付表示情報を取得'}
          </button>
        </div>

        {errorMessage ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}
     </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">日付表示ロジック結果</h2>
          {displayState === 'loading' ? (
            <p className="text-sm text-neutral-500">読み込み中です…</p>
          ) : null}
        </header>

        {displayState === 'success' && displayInfo ? (
          <div className="space-y-6 rounded border border-neutral-200 p-4 text-sm">
            <div className="space-y-2">
              <h3 className="font-semibold">カレンダー情報</h3>
              <ul className="space-y-1 text-neutral-700">
                <li>日付: {displayInfo.calendar.dateLabel}</li>
                <li>日付テキスト色: {displayInfo.calendar.dateTextColor}</li>
                <li>
                  曜日: {displayInfo.calendar.weekdayLabel} (No.
                  {displayInfo.calendar.weekdayNumber})
                </li>
                <li>曜日テキスト色: {displayInfo.calendar.weekdayTextColor}</li>
                <li>補足情報: {displayInfo.calendar.calendarSupplementalText}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">大学カレンダー情報</h3>
              <ul className="space-y-1 text-neutral-700">
                <li>学事情報ラベル: {displayInfo.academic.label}</li>
                <li>
                  授業曜日:{' '}
                  {displayInfo.academic.weekdayLabel
                    ? `${displayInfo.academic.weekdayLabel}曜 (${displayInfo.academic.weekdayNumber})`
                    : '-'}
                </li>
                <li>
                  授業回数:{' '}
                  {displayInfo.academic.classOrder !== null
                    ? `${displayInfo.academic.classOrder}回目`
                    : '-'}
                </li>
                <li>背景色タイプ: {displayInfo.academic.backgroundColor}</li>
                <li>学事情報サブラベル: {displayInfo.academic.subLabel ?? '-'}</li>
              </ul>
            </div>
          </div>
        ) : null}

        {displayState === 'success' && !displayInfo ? (
          <p className="text-sm text-neutral-500">該当日付のデータが見つかりませんでした。</p>
        ) : null}
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">期間一覧</h2>
          {termsState === 'loading' ? (
            <p className="text-sm text-neutral-500">読み込み中です…</p>
          ) : null}
        </header>
        {termsState === 'success' && terms && terms.length === 0 ? (
          <p className="text-sm text-neutral-500">期間データが見つかりませんでした。</p>
        ) : null}
        {terms && terms.length > 0 ? (
          <ul className="space-y-2">
            {terms.map((term) => (
              <li
                key={term.id}
                className="rounded border border-neutral-200 px-3 py-2 text-sm"
              >
                <p className="font-medium">{term.name}</p>
                <p className="text-neutral-500">
                  ID: {term.id}
                  {term.shortName ? ` / 表示名: ${term.shortName}` : null}
                  {typeof term.order === 'number' ? ` / 並び順: ${term.order}` : null}
                  {typeof term.isHoliday === 'boolean'
                    ? ` / 休講期間: ${term.isHoliday ? 'はい' : 'いいえ'}`
                    : null}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">日付一覧</h2>
          {daysState === 'loading' ? (
            <p className="text-sm text-neutral-500">読み込み中です…</p>
          ) : null}
        </header>
        {daysState === 'success' && days && days.length === 0 ? (
          <p className="text-sm text-neutral-500">日付データが見つかりませんでした。</p>
        ) : null}
        {days && days.length > 0 ? (
          <ul className="space-y-2">
            {days.map((day) => (
              <li
                key={day.id}
                className="rounded border border-neutral-200 px-3 py-2 text-sm"
              >
                <p className="font-medium">
                  日付: {day.date ?? day.id ?? '(不明)'}
                </p>
                <p className="text-neutral-500">
                  ID: {day.id}
                  {day.type ? ` / 種別: ${day.type}` : null}
                  {(() => {
                    if (
                      typeof day.classWeekday === 'number' &&
                      typeof day.classOrder === 'number'
                    ) {
                      return ` / 授業曜日: ${day.classWeekday}(${day.classOrder})`;
                    }
                    return ' / 授業曜日: -';
                  })()}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
