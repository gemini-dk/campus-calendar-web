'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, type DocumentData } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/useAuth';

type CalendarDayType = 'class_day' | 'holiday' | 'exam';

type CalendarTerm = {
  id: string;
  name: string;
  shortName: string | null;
  order: number | null;
  classCount: number | null;
  holidayFlag: 1 | 2 | null;
};

type CalendarTermStats = {
  classDayCount: number;
  firstClassDate: string | null;
  lastClassDate: string | null;
};

type CalendarDay = {
  id: string;
  date: string;
  dayOfWeek: number;
  termId: string | null;
  termName: string | null;
  type: CalendarDayType | string;
};

type WeeklySlot = {
  dayOfWeek: number;
  period: number;
};

type ClassDatePreview = {
  classDate: string;
  dayOfWeek: number;
  termId: string | null;
  termName: string | null;
  periods: number[];
};

type CalendarSummary = {
  name: string | null;
  fiscalYear: number | null;
  fiscalStart: string | null;
  fiscalEnd: string | null;
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

const CLASS_DAY_KEYWORDS = ['授業', 'class', '試験'];

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Number.isFinite(value) ? value : null;
};

const toMondayBasedWeekday = (jsWeekday: number): number =>
  jsWeekday === 0 ? 7 : jsWeekday;

const deriveWeekdayFromDate = (dateIso: string): number => {
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(timestamp)) {
    return 1;
  }
  const date = new Date(timestamp);
  return toMondayBasedWeekday(date.getUTCDay());
};

const isClassDayType = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  const lower = value.toLowerCase();
  if (lower === 'class_day') {
    return true;
  }
  return CLASS_DAY_KEYWORDS.some((keyword) => lower.includes(keyword));
};

const extractTermId = (data: DocumentData): string | null => {
  const raw = data.termId ?? data.term_id;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (raw && typeof raw === 'object') {
    const refId = 'id' in raw && typeof raw.id === 'string' ? raw.id.trim() : null;
    if (refId) {
      return refId;
    }
    if ('path' in raw && typeof raw.path === 'string') {
      const segments = raw.path.split('/');
      const last = segments[segments.length - 1];
      return last && last.length > 0 ? last : null;
    }
  }
  return null;
};

const parseCalendarTerm = (id: string, data: DocumentData): CalendarTerm | null => {
  const name = normalizeString(data.name ?? data.termName);
  if (!name) {
    return null;
  }
  const shortName = normalizeString(data.shortName ?? data.short_name);
  const orderValue = normalizeNumber(data.order ?? data.termOrder);
  const classCountValue = normalizeNumber(data.classCount ?? data.class_count);
  const holidayFlagValue = normalizeNumber(data.holidayFlag ?? data.holiday_flag);

  let holidayFlag: 1 | 2 | null = null;
  if (holidayFlagValue === 1 || holidayFlagValue === 2) {
    holidayFlag = holidayFlagValue;
  }

  return {
    id,
    name,
    shortName: shortName ?? null,
    order: orderValue !== null ? Math.trunc(orderValue) : null,
    classCount: classCountValue !== null ? Math.trunc(classCountValue) : null,
    holidayFlag,
  } satisfies CalendarTerm;
};

const parseCalendarDay = (id: string, data: DocumentData): CalendarDay | null => {
  const date = normalizeString(data.date);
  if (!date) {
    return null;
  }
  const type = normalizeString(data.type) ?? '未指定';
  const classWeekday = normalizeNumber(data.classWeekday ?? data.class_weekday);
  const termId = extractTermId(data);
  const termName = normalizeString(data.termName ?? data.term_name);

  const dayOfWeek = classWeekday !== null ? Math.min(Math.max(Math.trunc(classWeekday), 1), 7) : deriveWeekdayFromDate(date);

  return {
    id,
    date,
    dayOfWeek,
    termId,
    termName: termName ?? null,
    type,
  } satisfies CalendarDay;
};

const formatTermOrder = (order: number | null): string => {
  if (order === null || Number.isNaN(order)) {
    return '—';
  }
  return `#${order}`;
};

const DEFAULT_CALENDAR_ID = 'jd70dxbqvevcf5kj43cbaf4rjn7rs93e';
const DEFAULT_FISCAL_YEAR = '2025';

export default function TimetableDebugPage() {
  const {
    profile,
    isAuthenticated,
    initializing,
    isProcessing: authProcessing,
    error: authError,
    successMessage,
    signInWithGoogle,
    signOut: signOutUser,
  } = useAuth();

  const [className, setClassName] = useState('');
  const [calendarId, setCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [fiscalYear, setFiscalYear] = useState(DEFAULT_FISCAL_YEAR);
  const [credits, setCredits] = useState('2');
  const [classType, setClassType] = useState<'in_person' | 'online' | 'hybrid' | 'on_demand'>('in_person');
  const [selectedTermIds, setSelectedTermIds] = useState<Set<string>>(new Set());
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [termOptions, setTermOptions] = useState<CalendarTerm[]>([]);
  const [calendarSummary, setCalendarSummary] = useState<CalendarSummary | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const termMap = useMemo(() => new Map(termOptions.map((term) => [term.id, term])), [termOptions]);

  const selectedTerms = useMemo(
    () => termOptions.filter((term) => selectedTermIds.has(term.id)),
    [selectedTermIds, termOptions],
  );

  const trimmedCalendarId = calendarId.trim();
  const trimmedFiscalYear = fiscalYear.trim();

  const termStats = useMemo(() => {
    const stats = new Map<string, CalendarTermStats>();
    for (const term of termOptions) {
      stats.set(term.id, { classDayCount: 0, firstClassDate: null, lastClassDate: null });
    }
    for (const day of calendarDays) {
      if (!day.termId) {
        continue;
      }
      if (!isClassDayType(typeof day.type === 'string' ? day.type : String(day.type))) {
        continue;
      }
      const stat = stats.get(day.termId);
      if (!stat) {
        continue;
      }
      stat.classDayCount += 1;
      if (!stat.firstClassDate || day.date < stat.firstClassDate) {
        stat.firstClassDate = day.date;
      }
      if (!stat.lastClassDate || day.date > stat.lastClassDate) {
        stat.lastClassDate = day.date;
      }
    }
    return stats;
  }, [calendarDays, termOptions]);

  useEffect(() => {
    if (!profile?.uid) {
      setTermOptions([]);
      setCalendarSummary(null);
      setCalendarDays([]);
      setCalendarError(null);
      setIsLoadingCalendar(false);
      return;
    }

    if (trimmedCalendarId.length === 0 || trimmedFiscalYear.length === 0) {
      setTermOptions([]);
      setCalendarSummary(null);
      setCalendarDays([]);
      setCalendarError(null);
      setIsLoadingCalendar(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingCalendar(true);
    setCalendarError(null);

    const fetchData = async () => {
      try {
        const calendarRef = doc(db, 'users', profile.uid, 'calendars', trimmedCalendarId);
        const [calendarSnap, termSnap, daySnap] = await Promise.all([
          getDoc(calendarRef),
          getDocs(collection(calendarRef, 'terms')),
          getDocs(collection(calendarRef, 'days')),
        ]);

        if (isCancelled) {
          return;
        }

        if (calendarSnap.exists()) {
          const calendarData = calendarSnap.data() as DocumentData;
          const summary: CalendarSummary = {
            name: normalizeString(calendarData.name) ?? null,
            fiscalYear: normalizeNumber(calendarData.fiscalYear) ?? null,
            fiscalStart: normalizeString(calendarData.fiscalStart ?? calendarData.fiscal_start) ?? null,
            fiscalEnd: normalizeString(calendarData.fiscalEnd ?? calendarData.fiscal_end) ?? null,
          };
          setCalendarSummary(summary);
        } else {
          setCalendarSummary(null);
        }

        const loadedTerms: CalendarTerm[] = [];
        termSnap.forEach((docSnap) => {
          const parsed = parseCalendarTerm(docSnap.id, docSnap.data());
          if (parsed) {
            loadedTerms.push(parsed);
          }
        });
        loadedTerms.sort((a, b) => {
          const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.name.localeCompare(b.name, 'ja');
        });
        setTermOptions(loadedTerms);

        const loadedDays: CalendarDay[] = [];
        daySnap.forEach((docSnap) => {
          const parsed = parseCalendarDay(docSnap.id, docSnap.data());
          if (parsed) {
            loadedDays.push(parsed);
          }
        });
        loadedDays.sort((a, b) => a.date.localeCompare(b.date));

        const fiscalYearNumber = Number.parseInt(trimmedFiscalYear, 10);
        if (!Number.isNaN(fiscalYearNumber)) {
          const rangeStart = `${fiscalYearNumber}-04-01`;
          const rangeEnd = `${fiscalYearNumber + 1}-03-31`;
          setCalendarDays(
            loadedDays.filter((day) => day.date >= rangeStart && day.date <= rangeEnd),
          );
        } else {
          setCalendarDays(loadedDays);
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }
        console.error('Failed to load calendar data', error);
        setTermOptions([]);
        setCalendarSummary(null);
        setCalendarDays([]);
        setCalendarError(error instanceof Error ? error.message : 'カレンダーデータの取得に失敗しました。');
      } finally {
        if (!isCancelled) {
          setIsLoadingCalendar(false);
        }
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [profile?.uid, trimmedCalendarId, trimmedFiscalYear]);

  useEffect(() => {
    if (termOptions.length === 0) {
      setSelectedTermIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    const validIds = new Set(termOptions.map((term) => term.id));
    setSelectedTermIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      if (!changed && next.size === prev.size) {
        return prev;
      }
      return next;
    });
  }, [termOptions]);

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
    for (const day of calendarDays) {
      if (!day.termId || !selectedTermSet.has(day.termId)) {
        continue;
      }
      if (!isClassDayType(typeof day.type === 'string' ? day.type : String(day.type))) {
        continue;
      }
      const periods = slotsByDay.get(day.dayOfWeek);
      if (!periods || periods.length === 0) {
        continue;
      }
      const term = termMap.get(day.termId);
      results.push({
        classDate: day.date,
        dayOfWeek: day.dayOfWeek,
        termId: day.termId,
        termName: term?.name ?? day.termName,
        periods: [...periods],
      });
    }
    results.sort((a, b) => a.classDate.localeCompare(b.classDate));
    return results;
  }, [calendarDays, selectedTerms, termMap, weeklySlots]);

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
    const termNames = selectedTerms.map((term) => term.name);
    const termDisplayName = selectedTerms
      .map((term) => term.shortName || term.name)
      .filter((value) => value && value.length > 0)
      .join(', ');
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
          下記フォームで授業情報を入力し、Firestore 上の `calendar_terms` と `calendar_days` を用いて生成した結果をプレビューできます。
        </p>
      </header>

      <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">0. サインイン状態</h2>
            <p className="text-sm text-neutral-600">
              Firebase でサインインし、対象ユーザーの Firestore データにアクセスできる状態であることを確認してください。
            </p>
          </div>
          <div className="flex gap-2">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={signOutUser}
                disabled={authProcessing}
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                サインアウト
              </button>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={authProcessing}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Google でサインイン
              </button>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          {initializing ? (
            <p>認証状態を確認しています…</p>
          ) : isAuthenticated && profile ? (
            <ul className="grid gap-1 md:grid-cols-2">
              <li>
                <span className="font-medium">UID:</span> {profile.uid}
              </li>
              <li>
                <span className="font-medium">表示名:</span> {profile.displayName ?? '（未設定）'}
              </li>
              <li>
                <span className="font-medium">メール:</span> {profile.email ?? '（未設定）'}
              </li>
            </ul>
          ) : (
            <p>未サインインです。Firestore の学期データを取得するにはサインインしてください。</p>
          )}
        </div>
        {authError ? <p className="text-sm text-red-600">{authError}</p> : null}
        {successMessage ? <p className="text-sm text-green-600">{successMessage}</p> : null}
      </section>

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
              placeholder="2025"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-neutral-700">
            参照カレンダー ID (calendarId)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-base"
              value={calendarId}
              onChange={(event) => setCalendarId(event.target.value)}
              placeholder={DEFAULT_CALENDAR_ID}
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
        <div className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          <p className="font-semibold">読み込み対象のカレンダー情報</p>
          <ul className="mt-2 grid gap-1 md:grid-cols-2">
            <li>
              <span className="font-medium">UID:</span> {profile?.uid ?? '—'}
            </li>
            <li>
              <span className="font-medium">Calendar ID:</span> {trimmedCalendarId || '未入力'}
            </li>
            <li>
              <span className="font-medium">年度入力値:</span> {trimmedFiscalYear || '未入力'}
            </li>
            <li>
              <span className="font-medium">カレンダー名:</span>{' '}
              {calendarSummary?.name
                ? calendarSummary.name
                : isLoadingCalendar && trimmedCalendarId && trimmedFiscalYear
                  ? '読み込み中…'
                  : '未取得'}
            </li>
            <li>
              <span className="font-medium">年度 (Firestore):</span>{' '}
              {calendarSummary?.fiscalYear ?? '—'}
            </li>
            <li>
              <span className="font-medium">期間:</span>{' '}
              {calendarSummary?.fiscalStart && calendarSummary?.fiscalEnd
                ? `${formatDateLabel(calendarSummary.fiscalStart)} 〜 ${formatDateLabel(calendarSummary.fiscalEnd)}`
                : '—'}
            </li>
          </ul>
          {calendarError ? (
            <p className="mt-2 text-sm text-red-600">{calendarError}</p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">2. 学期選択 (calendar_terms)</h2>
          <span className="text-sm text-neutral-500">複数選択できます</span>
        </div>
        <div className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          <p className="font-semibold">取得状況</p>
          <ul className="mt-2 grid gap-1 md:grid-cols-2">
            <li>
              <span className="font-medium">取得済み学期数:</span> {termOptions.length} 件
            </li>
            <li>
              <span className="font-medium">利用可能な授業日:</span> {calendarDays.length} 日
            </li>
          </ul>
        </div>
        {!isAuthenticated && !initializing ? (
          <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
            サインインして学期データを取得してください。
          </p>
        ) : trimmedCalendarId.length === 0 || trimmedFiscalYear.length === 0 ? (
          <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
            学年とカレンダー ID を入力すると、対象年度の学期候補が表示されます。
          </p>
        ) : isLoadingCalendar ? (
          <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-500">学期データを読み込み中です…</p>
        ) : calendarError ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{calendarError}</p>
        ) : termOptions.length === 0 ? (
          <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-500">対象の学期データが見つかりませんでした。</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {termOptions.map((term) => {
              const checked = selectedTermIds.has(term.id);
              const stats = termStats.get(term.id);
              const classDayCount = stats?.classDayCount ?? 0;
              const firstClassDate = stats?.firstClassDate;
              const lastClassDate = stats?.lastClassDate;
              return (
                <label
                  key={term.id}
                  className={`grid gap-2 rounded-lg border px-4 py-3 transition ${checked ? 'border-blue-500 bg-blue-50 shadow-inner' : 'border-neutral-200 bg-white hover:border-blue-300'}`}
                >
                  <span className="flex items-center justify-between text-sm font-semibold text-neutral-800">
                    <span>{term.name}</span>
                    <span className="text-xs font-medium text-neutral-500">{formatTermOrder(term.order)}</span>
                  </span>
                  <span className="text-xs text-neutral-600">略称: {term.shortName ?? '（未設定）'}</span>
                  {term.classCount !== null ? (
                    <span className="text-xs text-neutral-600">classCount: {term.classCount} 日</span>
                  ) : null}
                  <span className="text-xs text-neutral-600">カレンダー授業日数: {classDayCount} 日</span>
                  <span className="text-xs text-neutral-600">
                    授業期間: {firstClassDate ? formatDateLabel(firstClassDate) : '—'} 〜 {lastClassDate ? formatDateLabel(lastClassDate) : '—'}
                  </span>
                  {term.holidayFlag ? (
                    <span className="text-xs text-neutral-500">
                      休日区分: {term.holidayFlag === 1 ? '授業扱い' : '休日扱い'}
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
        )}
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
          <span>選択学期: {selectedTerms.map((term) => term.name).join(' / ') || '未選択'}</span>
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
