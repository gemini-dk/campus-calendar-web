'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

const DEFAULT_FISCAL_YEAR = 2025;
const DEFAULT_CALENDAR_ID = 'jd70dxbqvevcf5kj43cbaf4rjn7rs93e';
const UNASSIGNED_TERM_ID = '__unassigned__';

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
  { value: 7, label: '日' },
];

const PERIODS = Array.from({ length: 7 }, (_, index) => index + 1);

type CalendarTerm = {
  _id: string;
  termName: string;
  shortName?: string;
  order?: number;
  classCount?: number;
  holidayFlag?: boolean;
};

type CalendarDay = {
  _id: string;
  date: string;
  type: '未指定' | '授業日' | '試験日' | '予備日' | '休講日';
  termId?: string;
  termName?: string;
  classWeekday?: number;
  classOrder?: number;
};

type CalendarSummary = {
  calendar: {
    _id: string;
    name: string;
    fiscalYear: number;
    fiscalStart: string;
    fiscalEnd: string;
  };
  terms: CalendarTerm[];
  days: CalendarDay[];
};

type WeeklySlot = {
  dayOfWeek: number;
  period: number;
};

type GeneratedClassDate = {
  date: string;
  weekday: number;
  termId: string;
  termName: string;
  periods: number[];
};

type TimetableFormValues = {
  className: string;
  teacher: string;
  location: string;
  credits: string;
  memo: string;
  classType: 'in_person' | 'online' | 'hybrid' | 'on_demand';
};

const WEEKDAY_LABEL_MAP = new Map(WEEKDAYS.map((weekday) => [weekday.value, weekday.label]));

const CLASS_TYPE_OPTIONS: Array<{ value: TimetableFormValues['classType']; label: string }> = [
  { value: 'in_person', label: '対面' },
  { value: 'online', label: 'オンライン' },
  { value: 'hybrid', label: 'ハイブリッド' },
  { value: 'on_demand', label: 'オンデマンド' },
];

const deriveWeekdayFromDate = (isoDate: string): number => {
  const [year, month, day] = isoDate.split('-').map((value) => Number(value));
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return 1;
  }
  const utcDate = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  const jsWeekday = utcDate.getUTCDay();
  return jsWeekday === 0 ? 7 : jsWeekday;
};

const toSlotKey = (slot: WeeklySlot) => `${slot.dayOfWeek}-${slot.period}`;

const parseSlotKey = (key: string): WeeklySlot | null => {
  const [day, period] = key.split('-').map((value) => Number(value));
  if (!Number.isFinite(day) || !Number.isFinite(period)) {
    return null;
  }
  return { dayOfWeek: day, period };
};

const buildTermDisplayName = (term: CalendarTerm) => {
  if (term.shortName && term.shortName.length > 0 && term.shortName !== term.termName) {
    return `${term.termName}（${term.shortName}）`;
  }
  return term.termName;
};

export default function TimetableDebugPage() {
  const [calendarIdInput, setCalendarIdInput] = useState(DEFAULT_CALENDAR_ID);
  const [calendarId, setCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [calendarData, setCalendarData] = useState<CalendarSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTermIds, setSelectedTermIds] = useState<string[]>([]);
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<string[]>([]);
  const [formValues, setFormValues] = useState<TimetableFormValues>({
    className: '',
    teacher: '',
    location: '',
    credits: '',
    memo: '',
    classType: 'in_person',
  });

  useEffect(() => {
    const controller = new AbortController();
    const fetchCalendar = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/calendars/${encodeURIComponent(calendarId)}?fiscalYear=${DEFAULT_FISCAL_YEAR}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          setCalendarData(null);
          setError(data?.error ?? 'カレンダー情報の取得に失敗しました。');
          return;
        }

        const data = (await response.json()) as CalendarSummary;
        setCalendarData(data);
      } catch (fetchError) {
        if (!(fetchError instanceof DOMException && fetchError.name === 'AbortError')) {
          setCalendarData(null);
          setError('カレンダー情報の取得中にエラーが発生しました。');
          console.error(fetchError);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCalendar();
    return () => controller.abort();
  }, [calendarId]);

  useEffect(() => {
    if (!calendarData) {
      setSelectedTermIds([]);
      return;
    }

    const hasUnassigned = calendarData.days.some((day) => !day.termId);
    const baseIds = calendarData.terms.map((term) => term._id);
    setSelectedTermIds(hasUnassigned ? [...baseIds, UNASSIGNED_TERM_ID] : baseIds);
  }, [calendarData]);

  const termOptions = useMemo(() => {
    if (!calendarData) {
      return [] as Array<{ id: string; label: string }>;
    }

    const options = calendarData.terms.map((term) => ({
      id: term._id,
      label: buildTermDisplayName(term),
    }));

    const hasUnassigned = calendarData.days.some((day) => !day.termId);
    if (hasUnassigned) {
      options.push({ id: UNASSIGNED_TERM_ID, label: '未分類' });
    }

    return options;
  }, [calendarData]);

  const selectedSlots = useMemo(() => {
    return selectedSlotKeys
      .map((key) => parseSlotKey(key))
      .filter((slot): slot is WeeklySlot => slot !== null);
  }, [selectedSlotKeys]);

  const generatedSchedule = useMemo<GeneratedClassDate[]>(() => {
    if (!calendarData || selectedTermIds.length === 0 || selectedSlots.length === 0) {
      return [];
    }

    const termIdSet = new Set(selectedTermIds);
    const termNameMap = new Map<string, string>();
    for (const term of calendarData.terms) {
      termNameMap.set(term._id, term.termName);
    }
    termNameMap.set(UNASSIGNED_TERM_ID, '未分類');

    const slotByWeekday = new Map<number, number[]>();
    for (const slot of selectedSlots) {
      const current = slotByWeekday.get(slot.dayOfWeek) ?? [];
      if (!current.includes(slot.period)) {
        current.push(slot.period);
        current.sort((a, b) => a - b);
      }
      slotByWeekday.set(slot.dayOfWeek, current);
    }

    const scheduleMap = new Map<string, GeneratedClassDate>();

    for (const day of calendarData.days) {
      if (day.type !== '授業日') {
        continue;
      }

      const resolvedTermId = day.termId ?? UNASSIGNED_TERM_ID;
      if (!termIdSet.has(resolvedTermId)) {
        continue;
      }

      const weekday = day.classWeekday && day.classWeekday >= 1 && day.classWeekday <= 7
        ? day.classWeekday
        : deriveWeekdayFromDate(day.date);
      const slotsForDay = slotByWeekday.get(weekday);
      if (!slotsForDay || slotsForDay.length === 0) {
        continue;
      }

      const key = `${day.date}:${resolvedTermId}`;
      const existing = scheduleMap.get(key);
      if (existing) {
        const merged = Array.from(new Set([...existing.periods, ...slotsForDay])).sort((a, b) => a - b);
        existing.periods = merged;
        continue;
      }

      const termName = day.termName && day.termName.trim().length > 0
        ? day.termName.trim()
        : termNameMap.get(resolvedTermId) ?? '未分類';

      scheduleMap.set(key, {
        date: day.date,
        weekday,
        termId: resolvedTermId,
        termName,
        periods: [...slotsForDay],
      });
    }

    return Array.from(scheduleMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarData, selectedTermIds, selectedSlots]);

  const slotSummary = useMemo(() => {
    const labelMap = new Map<number, string>();
    for (const weekday of WEEKDAYS) {
      labelMap.set(weekday.value, weekday.label);
    }
    return selectedSlots
      .slice()
      .sort((a, b) => (a.dayOfWeek === b.dayOfWeek ? a.period - b.period : a.dayOfWeek - b.dayOfWeek))
      .map((slot) => `${labelMap.get(slot.dayOfWeek) ?? slot.dayOfWeek}曜 ${slot.period}限`);
  }, [selectedSlots]);

  const handleToggleSlot = (dayOfWeek: number, period: number) => {
    setSelectedSlotKeys((prev) => {
      const key = `${dayOfWeek}-${period}`;
      if (prev.includes(key)) {
        return prev.filter((value) => value !== key);
      }
      return [...prev, key];
    });
  };

  const handleTermToggle = (termId: string) => {
    setSelectedTermIds((prev) => {
      if (prev.includes(termId)) {
        return prev.filter((value) => value !== termId);
      }
      return [...prev, termId];
    });
  };

  const handleCalendarIdSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = calendarIdInput.trim();
    if (trimmed.length > 0 && trimmed !== calendarId) {
      setCalendarId(trimmed);
    }
  };

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setFormValues((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const calendarMeta = calendarData?.calendar;

  return (
    <div className="min-h-screen bg-slate-950/95 px-6 py-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-sm font-semibold text-blue-300">Timetable Debug</p>
          <h1 className="text-3xl font-bold">授業作成デバッグフォーム</h1>
          <p className="text-sm text-slate-300">
            Firestore 時間割仕様に沿って授業作成に必要な情報を入力し、学期と曜日・時限の選択から授業日程を算出します。
          </p>
        </header>

        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-xl shadow-black/30">
          <h2 className="text-xl font-semibold text-blue-200">カレンダー選択</h2>
          <p className="mt-2 text-sm text-slate-300">
            年度は {DEFAULT_FISCAL_YEAR} 年度、カレンダー ID は既定値として
            <code className="mx-1 rounded bg-slate-800 px-2 py-1 text-xs text-blue-100">{DEFAULT_CALENDAR_ID}</code>
            を使用します。
          </p>

          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleCalendarIdSubmit}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-200">カレンダー ID</span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                value={calendarIdInput}
                onChange={(event) => setCalendarIdInput(event.target.value)}
                placeholder="Convex カレンダー ID"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            >
              再取得
            </button>
          </form>

          <div className="mt-4 text-sm text-slate-300">
            {loading && <p>カレンダー情報を取得しています…</p>}
            {error && <p className="text-red-300">{error}</p>}
            {!loading && !error && calendarMeta && (
              <div className="space-y-1">
                <p>
                  <span className="font-semibold text-slate-100">名称:</span> {calendarMeta.name}
                </p>
                <p>
                  <span className="font-semibold text-slate-100">年度:</span> {calendarMeta.fiscalYear}年度
                </p>
                <p>
                  <span className="font-semibold text-slate-100">期間:</span> {calendarMeta.fiscalStart} 〜 {calendarMeta.fiscalEnd}
                </p>
                <p>
                  <span className="font-semibold text-slate-100">授業日総数:</span> {
                    calendarData?.days.filter((day) => day.type === '授業日').length ?? 0
                  }
                  日
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-xl shadow-black/30">
          <h2 className="text-xl font-semibold text-blue-200">授業基本情報</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-200">授業名</span>
              <input
                className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                name="className"
                value={formValues.className}
                onChange={handleInputChange}
                placeholder="例: 情報基礎演習"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-200">担当教員</span>
              <input
                className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                name="teacher"
                value={formValues.teacher}
                onChange={handleInputChange}
                placeholder="教員名"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-200">教室</span>
              <input
                className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                name="location"
                value={formValues.location}
                onChange={handleInputChange}
                placeholder="教室番号など"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-200">単位数</span>
              <input
                className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                name="credits"
                value={formValues.credits}
                onChange={handleInputChange}
                placeholder="例: 2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium text-slate-200">メモ</span>
              <textarea
                className="min-h-[80px] rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                name="memo"
                value={formValues.memo}
                onChange={handleInputChange}
                placeholder="その他メモ"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-200">授業形態</span>
              <select
                className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                name="classType"
                value={formValues.classType}
                onChange={handleInputChange}
              >
                {CLASS_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-xl shadow-black/30">
          <h2 className="text-xl font-semibold text-blue-200">学期選択</h2>
          <p className="mt-2 text-sm text-slate-300">
            Convex の <code className="rounded bg-slate-800 px-2 py-1 text-xs text-blue-100">calendar_terms</code> から取得した学期を選択してください。
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {termOptions.length === 0 && (
              <p className="text-sm text-slate-400">学期情報が取得できていません。</p>
            )}
            {termOptions.map((term) => (
              <label
                key={term.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm hover:border-blue-400"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-400"
                  checked={selectedTermIds.includes(term.id)}
                  onChange={() => handleTermToggle(term.id)}
                />
                <span className="leading-tight text-slate-100">{term.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-xl shadow-black/30">
          <h2 className="text-xl font-semibold text-blue-200">曜日・時限選択</h2>
          <p className="mt-2 text-sm text-slate-300">
            授業が開講される曜日と時限をグリッドから選択してください。複数選択が可能です。
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="min-w-[4rem] rounded-lg bg-slate-800/80 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">
                    時限
                  </th>
                  {WEEKDAYS.map((weekday) => (
                    <th
                      key={weekday.value}
                      className="min-w-[4rem] rounded-lg bg-slate-800/80 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-300"
                    >
                      {weekday.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((period) => (
                  <tr key={period}>
                    <th className="rounded-lg bg-slate-800/80 px-3 py-2 text-left text-sm font-semibold text-slate-200">
                      {period}限
                    </th>
                    {WEEKDAYS.map((weekday) => {
                      const key = toSlotKey({ dayOfWeek: weekday.value, period });
                      const isSelected = selectedSlotKeys.includes(key);
                      return (
                        <td key={weekday.value} className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => handleToggleSlot(weekday.value, period)}
                            className={`flex h-12 w-full items-center justify-center rounded-lg border text-sm transition-colors ${
                              isSelected
                                ? 'border-blue-400 bg-blue-500/80 text-white shadow-inner shadow-blue-900/60'
                                : 'border-slate-700 bg-slate-900/80 text-slate-200 hover:border-blue-400 hover:bg-slate-800/80'
                            }`}
                            aria-pressed={isSelected}
                          >
                            {isSelected ? '選択中' : '—'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-xl border border-blue-500/40 bg-blue-900/20 px-4 py-3 text-sm text-blue-100">
            <p className="font-semibold">選択済みコマ</p>
            {slotSummary.length > 0 ? (
              <p>{slotSummary.join('、')}</p>
            ) : (
              <p className="text-blue-200/80">まだ曜日・時限が選択されていません。</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-xl shadow-black/30">
          <h2 className="text-xl font-semibold text-blue-200">授業日程プレビュー</h2>
          <p className="mt-2 text-sm text-slate-300">
            選択した学期と曜日・時限に基づいて授業日程を算出しています。Convex のカレンダーデータにある授業日のみが対象です。
          </p>

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
            <p>
              <span className="font-semibold text-slate-100">算出件数:</span> {generatedSchedule.length} 日
            </p>
            <p className="mt-1 text-xs text-slate-400">
              学期・曜日の組み合わせに該当する授業日のみが表示されます。オンデマンド授業の場合は曜日・時限選択を空のままにしてください。
            </p>
          </div>

          <div className="mt-6 max-h-[480px] overflow-y-auto">
            {generatedSchedule.length === 0 ? (
              <p className="text-sm text-slate-400">該当する授業日程がありません。</p>
            ) : (
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 bg-slate-900/90">
                  <tr>
                    <th className="border-b border-slate-700 px-4 py-2 text-left font-semibold text-slate-200">日付</th>
                    <th className="border-b border-slate-700 px-4 py-2 text-left font-semibold text-slate-200">曜日</th>
                    <th className="border-b border-slate-700 px-4 py-2 text-left font-semibold text-slate-200">学期</th>
                    <th className="border-b border-slate-700 px-4 py-2 text-left font-semibold text-slate-200">時限</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedSchedule.map((entry) => (
                    <tr key={`${entry.date}-${entry.termId}`} className="odd:bg-slate-900/40">
                      <td className="border-b border-slate-800 px-4 py-2 text-slate-100">{entry.date}</td>
                      <td className="border-b border-slate-800 px-4 py-2 text-slate-100">
                        {WEEKDAY_LABEL_MAP.get(entry.weekday) ?? entry.weekday}
                      </td>
                      <td className="border-b border-slate-800 px-4 py-2 text-slate-100">{entry.termName}</td>
                      <td className="border-b border-slate-800 px-4 py-2 text-slate-100">{entry.periods.join(', ')}限</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
