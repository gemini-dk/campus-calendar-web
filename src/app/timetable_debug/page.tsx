'use client';

import { useMemo, useState } from 'react';

type CalendarDayType = 'class_day' | 'holiday' | 'exam';

type CalendarTerm = {
  id: string;
  termName: string;
  shortName: string;
  termOrder: number;
  startDate: string;
  endDate: string;
  classDayOfWeeks: number[];
  excludedDates?: string[];
  notes?: string;
};

type CalendarDay = {
  date: string;
  dayOfWeek: number;
  termId: string;
  type: CalendarDayType;
};

type WeeklySlot = {
  dayOfWeek: number;
  period: number;
};

type ClassDatePreview = {
  classDate: string;
  dayOfWeek: number;
  termId: string;
  termName: string;
  periods: number[];
};

const WEEKDAYS: { value: number; label: string; longLabel: string }[] = [
  { value: 1, label: '月', longLabel: '月曜日' },
  { value: 2, label: '火', longLabel: '火曜日' },
  { value: 3, label: '水', longLabel: '水曜日' },
  { value: 4, label: '木', longLabel: '木曜日' },
  { value: 5, label: '金', longLabel: '金曜日' },
  { value: 6, label: '土', longLabel: '土曜日' },
  { value: 7, label: '日', longLabel: '日曜日' },
];

const PERIODS = [1, 2, 3, 4, 5, 6];

const SAMPLE_CALENDAR_TERMS: CalendarTerm[] = [
  {
    id: 'spring-2024',
    termName: '2024年度 春学期',
    shortName: '春',
    termOrder: 1,
    startDate: '2024-04-08',
    endDate: '2024-07-26',
    classDayOfWeeks: [1, 2, 3, 4, 5],
    excludedDates: ['2024-05-03', '2024-05-06'],
    notes: 'ゴールデンウィーク中の授業は休講扱い。',
  },
  {
    id: 'summer-2024',
    termName: '2024年度 夏季集中',
    shortName: '夏集中',
    termOrder: 2,
    startDate: '2024-08-05',
    endDate: '2024-08-23',
    classDayOfWeeks: [1, 2, 3, 4, 5],
    notes: '平日のみ3週間集中開講。',
  },
  {
    id: 'fall-2024',
    termName: '2024年度 秋学期',
    shortName: '秋',
    termOrder: 3,
    startDate: '2024-09-16',
    endDate: '2024-12-20',
    classDayOfWeeks: [1, 2, 3, 4, 5, 6],
    excludedDates: ['2024-11-04', '2024-11-23'],
    notes: '土曜授業を含む学期。祝日にあたる日は休講。',
  },
];

const SAMPLE_CALENDAR_DAYS = buildSampleCalendarDays(SAMPLE_CALENDAR_TERMS);

const TERM_MAP = new Map(SAMPLE_CALENDAR_TERMS.map((term) => [term.id, term] as const));

const TERM_CLASS_DAY_STATS: Record<
  string,
  {
    classDayCount: number;
    firstClassDate: string | null;
    lastClassDate: string | null;
  }
> = (() => {
  const stats: Record<string, { classDayCount: number; firstClassDate: string | null; lastClassDate: string | null }> = {};
  for (const term of SAMPLE_CALENDAR_TERMS) {
    stats[term.id] = { classDayCount: 0, firstClassDate: null, lastClassDate: null };
  }
  for (const day of SAMPLE_CALENDAR_DAYS) {
    if (day.type !== 'class_day') {
      continue;
    }
    const termStat = stats[day.termId];
    if (!termStat) {
      continue;
    }
    termStat.classDayCount += 1;
    if (!termStat.firstClassDate || day.date < termStat.firstClassDate) {
      termStat.firstClassDate = day.date;
    }
    if (!termStat.lastClassDate || day.date > termStat.lastClassDate) {
      termStat.lastClassDate = day.date;
    }
  }
  return stats;
})();

export default function TimetableDebugPage() {
  const [className, setClassName] = useState('');
  const [calendarId, setCalendarId] = useState('demo-calendar-2024');
  const [fiscalYear, setFiscalYear] = useState('2024');
  const [credits, setCredits] = useState('2');
  const [classType, setClassType] = useState<'in_person' | 'online' | 'hybrid' | 'on_demand'>('in_person');
  const [selectedTermIds, setSelectedTermIds] = useState<Set<string>>(new Set());
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());

  const selectedTerms = useMemo(
    () => SAMPLE_CALENDAR_TERMS.filter((term) => selectedTermIds.has(term.id)),
    [selectedTermIds],
  );

  const weeklySlots = useMemo<WeeklySlot[]>(() => {
    const slots: WeeklySlot[] = [];
    for (const key of selectedSlotKeys) {
      const [dayStr, periodStr] = key.split('-');
      const dayOfWeek = Number.parseInt(dayStr, 10);
      const period = Number.parseInt(periodStr, 10);
      if (Number.isNaN(dayOfWeek) || Number.isNaN(period)) {
        continue;
      }
      slots.push({ dayOfWeek, period });
    }
    return slots.sort((a, b) => (a.dayOfWeek === b.dayOfWeek ? a.period - b.period : a.dayOfWeek - b.dayOfWeek));
  }, [selectedSlotKeys]);

  const generatedClassDates = useMemo<ClassDatePreview[]>(() => {
    if (selectedTerms.length === 0 || weeklySlots.length === 0) {
      return [];
    }
    const selectedTermSet = new Set(selectedTerms.map((term) => term.id));
    const slotsByDay = new Map<number, number[]>();
    for (const slot of weeklySlots) {
      if (!slotsByDay.has(slot.dayOfWeek)) {
        slotsByDay.set(slot.dayOfWeek, []);
      }
      slotsByDay.get(slot.dayOfWeek)!.push(slot.period);
    }
    for (const periods of slotsByDay.values()) {
      periods.sort((a, b) => a - b);
    }
    const results: ClassDatePreview[] = [];
    for (const day of SAMPLE_CALENDAR_DAYS) {
      if (day.type !== 'class_day') {
        continue;
      }
      if (!selectedTermSet.has(day.termId)) {
        continue;
      }
      const periods = slotsByDay.get(day.dayOfWeek);
      if (!periods || periods.length === 0) {
        continue;
      }
      const term = TERM_MAP.get(day.termId);
      results.push({
        classDate: day.date,
        dayOfWeek: day.dayOfWeek,
        termId: day.termId,
        termName: term?.termName ?? day.termId,
        periods: [...periods],
      });
    }
    results.sort((a, b) => a.classDate.localeCompare(b.classDate));
    return results;
  }, [selectedTerms, weeklySlots]);

  const omitWeeklySlots = weeklySlots.length === 0;

  const maxAbsenceDays = useMemo(() => {
    if (omitWeeklySlots) {
      return 0;
    }
    const total = generatedClassDates.length;
    if (total === 0) {
      return 0;
    }
    const calculated = Math.floor(total * 0.33);
    return Math.min(calculated, total);
  }, [generatedClassDates.length, omitWeeklySlots]);

  const timetableClassDocument = useMemo(() => {
    const sanitizedName = className.trim();
    const termNames = selectedTerms.map((term) => term.termName);
    const termDisplayName = selectedTerms.map((term) => term.shortName || term.termName).join(', ');
    return {
      className: sanitizedName,
      fiscalYear: fiscalYear ? Number(fiscalYear) : null,
      calendarId: calendarId.trim(),
      termNames,
      termDisplayName: termNames.length > 0 ? termDisplayName : null,
      classType,
      credits: credits ? Number(credits) : null,
      creditsStatus: 'in_progress' as const,
      teacher: null,
      location: null,
      memo: null,
      omitWeeklySlots,
      maxAbsenceDays,
    };
  }, [calendarId, className, classType, credits, fiscalYear, maxAbsenceDays, omitWeeklySlots, selectedTerms]);

  const weeklySlotDocuments = useMemo(
    () =>
      weeklySlots.map((slot, index) => ({
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        displayOrder: index + 1,
      })),
    [weeklySlots],
  );

  const classDateDocuments = useMemo(
    () =>
      generatedClassDates.map((item) => ({
        classDate: item.classDate,
        periods: item.periods,
        termId: item.termId,
        termName: item.termName,
      })),
    [generatedClassDates],
  );

  const toggleTermSelection = (termId: string) => {
    setSelectedTermIds((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) {
        next.delete(termId);
      } else {
        next.add(termId);
      }
      return next;
    });
  };

  const toggleWeeklySlot = (dayOfWeek: number, period: number) => {
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      const key = createSlotKey(dayOfWeek, period);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold">授業作成デバッグ</h1>
        <p className="text-sm text-neutral-600">
          Firestore へ書き込む前段階で、学期と曜日・時限の組み合わせから授業日程をどのように算出できるか確認するためのデバッグ画面です。
        </p>
        <p className="text-sm text-neutral-600">
          下記フォームで授業情報を入力し、`calendar_terms` のサンプルデータと照合した結果をプレビューできます。
        </p>
      </header>

      <section className="grid gap-6 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">1. 授業の基本情報</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-neutral-700">
            授業名 (className)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-base"
              value={className}
              onChange={(event) => setClassName(event.target.value)}
              placeholder="例: 線形代数学"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-neutral-700">
            学年 (fiscalYear)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-base"
              value={fiscalYear}
              onChange={(event) => setFiscalYear(event.target.value)}
              placeholder="2024"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-neutral-700">
            参照カレンダー ID (calendarId)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-base"
              value={calendarId}
              onChange={(event) => setCalendarId(event.target.value)}
              placeholder="demo-calendar-2024"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-neutral-700">
            単位数 (credits)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-base"
              value={credits}
              onChange={(event) => setCredits(event.target.value)}
              placeholder="2"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-neutral-700">
            授業形態 (classType)
            <select
              className="rounded border border-neutral-300 px-3 py-2 text-base"
              value={classType}
              onChange={(event) => setClassType(event.target.value as typeof classType)}
            >
              <option value="in_person">対面 (in_person)</option>
              <option value="online">オンライン (online)</option>
              <option value="hybrid">ハイブリッド (hybrid)</option>
              <option value="on_demand">オンデマンド (on_demand)</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">2. 学期選択 (calendar_terms)</h2>
          <span className="text-sm text-neutral-500">複数選択できます</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {SAMPLE_CALENDAR_TERMS.map((term) => {
            const checked = selectedTermIds.has(term.id);
            const stats = TERM_CLASS_DAY_STATS[term.id];
            const classDayCount = stats?.classDayCount ?? 0;
            return (
              <label
                key={term.id}
                className={`grid gap-2 rounded-lg border px-4 py-3 transition ${checked ? 'border-blue-500 bg-blue-50 shadow-inner' : 'border-neutral-200 bg-white hover:border-blue-300'}`}
              >
                <span className="flex items-center justify-between text-sm font-semibold text-neutral-800">
                  <span>{term.termName}</span>
                  <span className="text-xs font-medium text-neutral-500">#{term.termOrder}</span>
                </span>
                <span className="text-xs text-neutral-600">略称: {term.shortName || '（未設定）'}</span>
                <span className="text-xs text-neutral-600">
                  期間: {formatDateLabel(term.startDate)} 〜 {formatDateLabel(term.endDate)}
                </span>
                <span className="text-xs text-neutral-600">想定授業日: 平日 {term.classDayOfWeeks.map((day) => weekdayLabel(day)).join('・')}</span>
                <span className="text-xs text-neutral-600">授業日数: {classDayCount} 日</span>
                {term.notes ? <span className="text-xs text-neutral-500">{term.notes}</span> : null}
                {term.excludedDates && term.excludedDates.length > 0 ? (
                  <span className="text-xs text-neutral-500">
                    休講日: {term.excludedDates.map((date) => formatDateLabel(date)).join(', ')}
                  </span>
                ) : null}
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTermSelection(term.id)}
                  className="hidden"
                />
              </label>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">3. 曜日・時限選択</h2>
          <span className="text-sm text-neutral-500">複数マスを選択して週次枠を定義します</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className="w-24 border border-neutral-200 bg-neutral-50 px-2 py-2 text-left text-xs font-semibold text-neutral-600">
                  時限 / 曜日
                </th>
                {WEEKDAYS.map((weekday) => (
                  <th
                    key={weekday.value}
                    className="border border-neutral-200 bg-neutral-50 px-2 py-2 text-xs font-semibold text-neutral-600"
                  >
                    {weekday.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((period) => (
                <tr key={period}>
                  <th className="border border-neutral-200 bg-neutral-50 px-2 py-3 text-left text-xs font-medium text-neutral-600">
                    {period} 限
                  </th>
                  {WEEKDAYS.map((weekday) => {
                    const key = createSlotKey(weekday.value, period);
                    const isSelected = selectedSlotKeys.has(key);
                    return (
                      <td key={weekday.value} className="border border-neutral-200 p-2">
                        <button
                          type="button"
                          onClick={() => toggleWeeklySlot(weekday.value, period)}
                          aria-pressed={isSelected}
                          className={`flex h-12 w-full items-center justify-center rounded-md border text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${isSelected ? 'border-blue-600 bg-blue-600 text-white shadow-inner' : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700'}`}
                        >
                          {isSelected ? '選択中' : '追加'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-700">
          <p className="font-semibold">選択済み週次枠</p>
          {weeklySlots.length === 0 ? (
            <p className="mt-2 text-neutral-500">週次枠が未選択のため、オンデマンド扱い (`omitWeeklySlots = true`) になります。</p>
          ) : (
            <ul className="mt-2 grid gap-1 md:grid-cols-2">
              {weeklySlots.map((slot, index) => (
                <li key={`${slot.dayOfWeek}-${slot.period}`} className="flex items-center justify-between rounded border border-neutral-200 bg-white px-3 py-2">
                  <span>
                    {weekdayLabel(slot.dayOfWeek)} {slot.period}限
                  </span>
                  <span className="text-xs text-neutral-500">displayOrder: {index + 1}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">4. 授業日程プレビュー (class_dates)</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
          <span>選択学期: {selectedTerms.map((term) => term.termName).join(' / ') || '未選択'}</span>
          <span>週次枠数: {weeklySlots.length}</span>
          <span>生成された授業日: {generatedClassDates.length} 日</span>
          <span>欠席許容回数 (33%): {maxAbsenceDays}</span>
        </div>
        {generatedClassDates.length === 0 ? (
          <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
            学期と週次枠を選択すると、ここに授業日程が表示されます。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <th className="w-36 border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold text-neutral-600">
                    日付
                  </th>
                  <th className="w-24 border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold text-neutral-600">
                    曜日
                  </th>
                  <th className="border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold text-neutral-600">
                    学期
                  </th>
                  <th className="border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold text-neutral-600">
                    periods 配列
                  </th>
                </tr>
              </thead>
              <tbody>
                {generatedClassDates.map((entry) => (
                  <tr key={`${entry.classDate}-${entry.termId}`} className="odd:bg-white even:bg-neutral-50">
                    <td className="border border-neutral-200 px-3 py-2 text-sm text-neutral-700">{formatDateLabel(entry.classDate)}</td>
                    <td className="border border-neutral-200 px-3 py-2 text-sm text-neutral-700">{weekdayLabel(entry.dayOfWeek)}</td>
                    <td className="border border-neutral-200 px-3 py-2 text-sm text-neutral-700">{entry.termName}</td>
                    <td className="border border-neutral-200 px-3 py-2 text-sm text-neutral-700">[{entry.periods.join(', ')}]</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">5. Firestore 書き込みプレビュー</h2>
        <div className="grid gap-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">/timetable_classes/{'{classId}'}</h3>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-900 px-4 py-3 text-xs text-neutral-50">
              {JSON.stringify(timetableClassDocument, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">/weekly_slots サブコレクション</h3>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-900 px-4 py-3 text-xs text-neutral-50">
              {JSON.stringify(weeklySlotDocuments, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">/class_dates サブコレクション</h3>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-900 px-4 py-3 text-xs text-neutral-50">
              {JSON.stringify(classDateDocuments.slice(0, 20), null, 2)}
            </pre>
            {classDateDocuments.length > 20 ? (
              <p className="mt-2 text-xs text-neutral-500">※ 表示件数を 20 件に制限しています。全 {classDateDocuments.length} 件。</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function createSlotKey(dayOfWeek: number, period: number) {
  return `${dayOfWeek}-${period}`;
}

function weekdayLabel(dayOfWeek: number) {
  const item = WEEKDAYS.find((weekday) => weekday.value === dayOfWeek);
  return item ? item.longLabel : `曜日${dayOfWeek}`;
}

function formatDateLabel(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map((value) => Number.parseInt(value, 10));
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return isoDate;
  }
  return `${year}年${month}月${day}日`;
}

function buildSampleCalendarDays(terms: CalendarTerm[]): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (const term of terms) {
    const holidaySet = new Set(term.excludedDates ?? []);
    const start = createUtcDate(term.startDate);
    const end = createUtcDate(term.endDate);
    for (let current = start; current.getTime() <= end.getTime(); current = addDays(current, 1)) {
      const iso = formatIso(current);
      const dayOfWeek = toAcademicWeekday(current);
      if (holidaySet.has(iso)) {
        days.push({
          date: iso,
          dayOfWeek,
          termId: term.id,
          type: 'holiday',
        });
        continue;
      }
      if (!term.classDayOfWeeks.includes(dayOfWeek)) {
        continue;
      }
      days.push({
        date: iso,
        dayOfWeek,
        termId: term.id,
        type: 'class_day',
      });
    }
  }
  return days;
}

function createUtcDate(iso: string) {
  const [year, month, day] = iso.split('-').map((value) => Number.parseInt(value, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, amount: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function toAcademicWeekday(date: Date) {
  const weekday = date.getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function formatIso(date: Date) {
  return date.toISOString().slice(0, 10);
}
