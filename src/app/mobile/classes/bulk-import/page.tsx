"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

import { getCalendarTerms } from '@/lib/data/service/calendar.service';
import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';
import type { WeeklySlotSelection } from '@/lib/data/service/class.service';
import { CreateClassDialog, type CreateClassPresetFormValues } from '@/app/mobile/tabs/classes/CreateClassDialog';

type WeeklySlot = {
  dayOfWeek: number;
  period: number | 'OD';
};

type ImportedClass = {
  id: string;
  className: string;
  classType: 'in_person' | 'online' | 'hybrid' | 'on_demand';
  termIds: string[];
  termNames: string[];
  weeklySlots: WeeklySlot[];
  location: string | null;
  teacher: string | null;
  credits: number | string | null;
  isFullyOnDemand: boolean;
  memo: string | null;
};

type ScheduleEntry = {
  classId: string;
  className: string;
  location: string | null;
};

type TermCandidate = {
  id: string;
  name: string;
  isHoliday?: boolean;
};

const WEEKDAY_HEADERS = [
  { key: 1, label: '月' },
  { key: 2, label: '火' },
  { key: 3, label: '水' },
  { key: 4, label: '木' },
  { key: 5, label: '金' },
  { key: 6, label: '土' },
];

function normalizePeriod(value: unknown): number | 'OD' | null {
  if (value === 'OD') {
    return 'OD';
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed <= 0) {
    return 'OD';
  }
  return parsed;
}

function normalizeImportedClass(raw: unknown, index: number): ImportedClass | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const className = typeof (raw as { className?: unknown }).className === 'string'
    ? (raw as { className: string }).className.trim()
    : '';

  if (!className) {
    return null;
  }

  const typeValue = (raw as { classType?: unknown }).classType;
  const classType: ImportedClass['classType'] =
    typeValue === 'online' || typeValue === 'hybrid' || typeValue === 'on_demand'
      ? typeValue
      : 'in_person';

  const termIds = Array.isArray((raw as { termIds?: unknown }).termIds)
    ? ((raw as { termIds: unknown[] }).termIds
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0))
    : [];

  const termNames = Array.isArray((raw as { termNames?: unknown }).termNames)
    ? ((raw as { termNames: unknown[] }).termNames
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0))
    : [];

  const weeklySlots = Array.isArray((raw as { weeklySlots?: unknown }).weeklySlots)
    ? ((raw as { weeklySlots: unknown[] }).weeklySlots
        .map((slot) => {
          if (typeof slot !== 'object' || slot === null) {
            return null;
          }
          const dayOfWeek = Number.parseInt(String((slot as { dayOfWeek?: unknown }).dayOfWeek), 10);
          const periodValue = normalizePeriod((slot as { period?: unknown }).period);
          if (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7 || periodValue === null) {
            return null;
          }
          return { dayOfWeek, period: periodValue } satisfies WeeklySlot;
        })
        .filter((slot): slot is WeeklySlot => slot !== null))
    : [];

  const location = typeof (raw as { location?: unknown }).location === 'string'
    ? (raw as { location: string }).location.trim() || null
    : null;
  const teacher = typeof (raw as { teacher?: unknown }).teacher === 'string'
    ? (raw as { teacher: string }).teacher.trim() || null
    : null;

  const creditsRaw = (raw as { credits?: unknown }).credits;
  const credits = typeof creditsRaw === 'string' || typeof creditsRaw === 'number' ? creditsRaw : null;

  const isFullyOnDemand = Boolean((raw as { isFullyOnDemand?: unknown }).isFullyOnDemand);
  const memo =
    typeof (raw as { memo?: unknown }).memo === 'string'
      ? (raw as { memo: string }).memo.trim() || null
      : null;

  return {
    id: `import-${index}`,
    className,
    classType,
    termIds,
    termNames,
    weeklySlots,
    location,
    teacher,
    credits,
    isFullyOnDemand,
    memo,
  } satisfies ImportedClass;
}

function buildTermLabel(item: ImportedClass | null): string {
  if (!item) {
    return '未設定';
  }
  if (item.termNames.length > 0) {
    return item.termNames.join('、');
  }
  return '未設定';
}

function buildLocationLabel(item: ImportedClass | null): string {
  if (!item) {
    return '場所未設定';
  }
  return item.location ?? '場所未設定';
}

function buildScheduleMap(classes: ImportedClass[], termId: string): Map<string, ScheduleEntry[]> {
  const map = new Map<string, ScheduleEntry[]>();
  for (const classItem of classes) {
    const belongsToTerm = classItem.termIds.length === 0 || classItem.termIds.includes(termId);
    if (!belongsToTerm || classItem.isFullyOnDemand) {
      continue;
    }
    for (const slot of classItem.weeklySlots) {
      const key = `${slot.dayOfWeek}-${slot.period}`;
      const current = map.get(key) ?? [];
      current.push({
        classId: classItem.id,
        className: classItem.className,
        location: buildLocationLabel(classItem),
      });
      map.set(key, current);
    }
  }
  return map;
}

export default function BulkImportPage() {
  const { settings, initialized } = useUserSettings();
  const { profile, isAuthenticated } = useAuth();
  const [text, setText] = useState('');
  const [classes, setClasses] = useState<ImportedClass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'multiple' | 'syllabus' | null>(null);
  const [termCandidates, setTermCandidates] = useState<TermCandidate[]>([]);
  const [termLoadState, setTermLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [activeTermId, setActiveTermId] = useState<string>('unspecified');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogClassId, setDialogClassId] = useState<string | null>(null);
  const [savedClassIds, setSavedClassIds] = useState<Set<string>>(new Set());

  const calendarOptions = settings.calendar.entries ?? [];
  const userId = profile?.uid ?? null;

  useEffect(() => {
    if (!initialized) {
      return;
    }

    const fiscalYear = settings.calendar.fiscalYear;
    const calendarId = settings.calendar.calendarId;
    if (!fiscalYear || !calendarId) {
      setTermCandidates([]);
      return;
    }

    setTermLoadState('loading');
    getCalendarTerms(fiscalYear, calendarId)
      .then((terms) => {
        const options = terms
          .filter((term) => term.holidayFlag == 2)
          .map((term) => ({ id: term.id, name: term.name }));
        setTermCandidates(options);
        setTermLoadState('idle');
      })
      .catch((loadError) => {
        console.error('学期データの取得に失敗しました', loadError);
        setTermCandidates([]);
        setTermLoadState('error');
      });
  }, [initialized, settings.calendar.calendarId, settings.calendar.fiscalYear]);

  const handleImport = async (type: 'multiple' | 'syllabus') => {
    setLoading(true);
    setLoadingType(type);
    setError(null);
    setActionError(null);
    setClasses([]);
    setSavedClassIds(new Set());
    setIsDialogOpen(false);
    setDialogClassId(null);
    try {
      const response = await fetch('/api/class-bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, termCandidates, importType: type }),
      });

      const data = (await response.json()) as { data?: unknown; error?: string };

      if (!response.ok) {
        setError(data.error ?? '変換に失敗しました。');
        return;
      }

      const parsed = Array.isArray(data.data)
        ? data.data
            .map((item, index) => normalizeImportedClass(item, index))
            .filter((item): item is ImportedClass => item !== null)
        : [];

      setClasses(parsed);
      setSelectedClassId(parsed[0]?.id ?? null);
    } catch (importError) {
      console.error('授業データ取り込みの実行に失敗しました', importError);
      setError('変換に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  const termTabs = useMemo(() => {
    const tabs = new Map<string, string>();
    for (const classItem of classes) {
      if (classItem.termIds.length === 0) {
        tabs.set('unspecified', '学期未設定');
      }
      classItem.termIds.forEach((termId, index) => {
        const label = classItem.termNames[index] ?? classItem.termNames[0] ?? '学期';
        tabs.set(termId, label);
      });
    }
    if (tabs.size === 0) {
      tabs.set('unspecified', '学期未設定');
    }
    return Array.from(tabs.entries()).map(([id, name]) => ({ id, name }));
  }, [classes]);

  useEffect(() => {
    if (termTabs.length === 0) {
      setActiveTermId('unspecified');
      return;
    }
    const firstTab = termTabs[0]?.id ?? 'unspecified';
    setActiveTermId((prev) => (termTabs.some((tab) => tab.id === prev) ? prev : firstTab));
  }, [termTabs]);

  useEffect(() => {
    if (classes.length === 0) {
      setSelectedClassId(null);
      return;
    }
    const belongs = classes.find(
      (item) =>
        item.id === selectedClassId && (item.termIds.length === 0 || item.termIds.includes(activeTermId)),
    );
    if (belongs) {
      return;
    }
    const fallback =
      classes.find((item) => item.termIds.length === 0 || item.termIds.includes(activeTermId)) ?? classes[0] ?? null;
    setSelectedClassId(fallback?.id ?? null);
  }, [activeTermId, classes, selectedClassId]);

  const handleSelectClass = useCallback(
    (classId: string) => {
      setSelectedClassId(classId);
      if (!isAuthenticated) {
        setActionError('授業の保存にはログインが必要です。ユーザタブからサインインしてください。');
        return;
      }
      setActionError(null);
      setDialogClassId(classId);
      setIsDialogOpen(true);
    },
    [isAuthenticated],
  );

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setDialogClassId(null);
  }, []);

  const handleCreated = useCallback(() => {
    setIsDialogOpen(false);
    setDialogClassId((prev) => {
      if (prev) {
        setSavedClassIds((saved) => {
          const next = new Set(saved);
          next.add(prev);
          return next;
        });
      }
      return null;
    });
  }, []);

  const periodLabels = useMemo(() => {
    const numbers = new Set<number>();
    let hasOnDemand = false;
    let hasFullOnDemand = false;

    for (const classItem of classes) {
      const belongsToTerm = classItem.termIds.length === 0 || classItem.termIds.includes(activeTermId);
      if (!belongsToTerm) {
        continue;
      }
      if (classItem.isFullyOnDemand) {
        hasFullOnDemand = true;
      }
      for (const slot of classItem.weeklySlots) {
        if (slot.period === 'OD') {
          hasOnDemand = true;
          continue;
        }
        numbers.add(slot.period);
      }
    }

    const sorted = Array.from(numbers).sort((a, b) => a - b).map((item) => String(item));
    if (hasOnDemand) {
      sorted.push('OD');
    }
    if (hasFullOnDemand) {
      sorted.push('FOD');
    }

    if (sorted.length === 0) {
      return ['1', '2', '3', '4', '5', '6'];
    }

    return sorted;
  }, [activeTermId, classes]);

  const regularPeriodLabels = useMemo(() => periodLabels.filter((label) => label !== 'FOD'), [periodLabels]);
  const hasFullOnDemandRow = periodLabels.includes('FOD');

  const columnTemplate = useMemo(
    () => `${'2.5rem'} repeat(${WEEKDAY_HEADERS.length}, minmax(0, 1fr))`,
    [],
  );

  const gridRowTemplate = useMemo(() => {
    const rows: string[] = ['auto'];
    if (regularPeriodLabels.length > 0) {
      rows.push(`repeat(${regularPeriodLabels.length}, minmax(0, 1fr))`);
    }
    if (hasFullOnDemandRow) {
      rows.push('auto');
    }
    return rows.join(' ');
  }, [hasFullOnDemandRow, regularPeriodLabels.length]);

  const scheduleMap = useMemo(() => buildScheduleMap(classes, activeTermId), [activeTermId, classes]);

  const fullOnDemandEntries = useMemo(
    () =>
      classes
        .filter(
          (item) =>
            item.isFullyOnDemand && (item.termIds.length === 0 || item.termIds.includes(activeTermId)),
        )
        .map((item) => ({ classId: item.id, className: item.className, location: buildLocationLabel(item) })),
    [activeTermId, classes],
  );

  const dialogTargetClass = useMemo(
    () => classes.find((item) => item.id === dialogClassId) ?? null,
    [classes, dialogClassId],
  );

  const dialogPresetTermIds = useMemo(() => {
    if (!dialogTargetClass) {
      return undefined;
    }
    if (dialogTargetClass.termIds.length > 0) {
      return dialogTargetClass.termIds;
    }
    if (activeTermId !== 'unspecified') {
      return [activeTermId];
    }
    return undefined;
  }, [activeTermId, dialogTargetClass]);

  const dialogPresetWeeklySlots = useMemo<WeeklySlotSelection[]>(() => {
    if (!dialogTargetClass || dialogTargetClass.isFullyOnDemand) {
      return [];
    }
    return dialogTargetClass.weeklySlots
      .map((slot) => {
        const periodValue = slot.period === 'OD' ? 0 : Number(slot.period);
        if (!Number.isFinite(periodValue)) {
          return null;
        }
        return {
          dayOfWeek: slot.dayOfWeek,
          period: Number(periodValue),
        } satisfies WeeklySlotSelection;
      })
      .filter((slot): slot is WeeklySlotSelection => slot !== null);
  }, [dialogTargetClass]);

  const dialogPresetFormValues = useMemo<CreateClassPresetFormValues | undefined>(() => {
    if (!dialogTargetClass) {
      return undefined;
    }
    const creditsValue = dialogTargetClass.credits;
    return {
      className: dialogTargetClass.className,
      classType: dialogTargetClass.classType,
      location: dialogTargetClass.classType === 'hybrid' ? '' : dialogTargetClass.location ?? '',
      teacher: dialogTargetClass.teacher ?? '',
      creditsText: creditsValue !== null && creditsValue !== undefined ? String(creditsValue) : '',
      isFullyOnDemand: dialogTargetClass.isFullyOnDemand,
      weeklySlots: dialogTargetClass.isFullyOnDemand ? [] : dialogPresetWeeklySlots,
      memo: dialogTargetClass.memo ?? '',
    } satisfies CreateClassPresetFormValues;
  }, [dialogPresetWeeklySlots, dialogTargetClass]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-neutral-50">
      <header className="flex h-14 w-full items-center border-b border-neutral-200 bg-white px-4">
        <div className="flex w-full items-center justify-between">
          <Link
            href="/mobile"
            className="flex h-10 items-center rounded px-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
          >
            戻る
          </Link>
          <h1 className="text-base font-semibold text-neutral-900">授業データ取り込み</h1>
          <span className="w-12" aria-hidden="true" />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 pb-8">
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-6">
          <div className="flex w-full flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-neutral-700">
              受講している授業やシラバスの内容を貼り付け、取り込み方法を選んでください。
            </p>
            <p className="text-xs text-neutral-500">
              {termLoadState === 'loading'
                ? '学期情報を読み込み中です...'
                : termCandidates.length > 0
                  ? `学期候補: ${termCandidates.map((term) => term.name).join(' / ')}`
                  : '学期候補が見つかりません。時間割設定を確認してください。'}
            </p>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="h-56 w-full rounded border border-neutral-300 bg-white p-3 text-sm text-neutral-800 shadow-sm focus:border-blue-400 focus:outline-none"
              placeholder="例: 月曜1限 経済学入門 教室A 2単位..."
            />
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleImport('multiple')}
                disabled={loading}
                className="flex h-11 w-full items-center justify-center rounded bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {loading && loadingType === 'multiple' ? '変換中...' : '複数授業一括取り込み'}
              </button>
              <button
                type="button"
                onClick={() => handleImport('syllabus')}
                disabled={loading}
                className="flex h-11 w-full items-center justify-center rounded bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
              >
                {loading && loadingType === 'syllabus' ? '変換中...' : 'シラバスデータ取り込み'}
              </button>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>

          {classes.length > 0 ? (
            <div className="flex w-full flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-neutral-900">取り込み内容の確認</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {termTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTermId(tab.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        tab.id === activeTermId
                          ? 'bg-blue-600 text-white'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {tab.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-sm">授業を選択し、保存ボタンを押してください。<br/><b>この機能は有料です。</b>アドオンを購入されていない方は購入をお願いします。</div>

              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                <div
                  className="grid h-full w-full"
                  style={{
                    gridTemplateColumns: columnTemplate,
                    gridTemplateRows: gridRowTemplate,
                  }}
                >
                  <div
                    className="flex h-10 w-full items-center justify-center border-b border-r border-neutral-200 bg-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-600"
                    style={{ gridColumnStart: 1, gridRowStart: 1 }}
                  />
                  {WEEKDAY_HEADERS.map((weekday, weekdayIndex) => (
                    <div
                      key={`header-${weekday.key}`}
                      className="flex h-10 items-center justify-center border-b border-r border-neutral-200 bg-neutral-100 text-base font-semibold text-neutral-800"
                      style={{ gridColumnStart: weekdayIndex + 2, gridRowStart: 1 }}
                    >
                      {weekday.label}
                    </div>
                  ))}

                  {regularPeriodLabels.map((label, rowIndex) => (
                    <Fragment key={`row-${label}`}>
                      <div
                        className="flex h-full w-full items-center justify-center border-b border-r border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600"
                        style={{ gridColumnStart: 1, gridRowStart: rowIndex + 2 }}
                      >
                        <span className="block w-full truncate">{label}</span>
                      </div>
                      {WEEKDAY_HEADERS.map((weekday, weekdayIndex) => {
                        const cellKey = `${weekday.key}-${label}`;
                        const entries = scheduleMap.get(cellKey) ?? [];
                        return (
                          <div
                            key={`cell-${label}-${weekday.key}`}
                            className="border-b border-r border-neutral-200 bg-white"
                            style={{
                              gridColumnStart: weekdayIndex + 2,
                              gridRowStart: rowIndex + 2,
                            }}
                          >
                            {entries.length > 0 ? (
                              <div className="flex h-full min-h-0 w-full flex-col gap-1 p-1">
                                {entries.map((entry) => (
                                  <button
                                    key={entry.classId}
                                    type="button"
                                    onClick={() => handleSelectClass(entry.classId)}
                                    className={`flex min-h-0 flex-col gap-1 rounded-lg border px-1 py-1 text-left transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${(() => {
                                      const isSelected = entry.classId === selectedClassId;
                                      const isSaved = savedClassIds.has(entry.classId);
                                      if (isSaved && isSelected) {
                                        return 'border-blue-400 bg-neutral-200 shadow-sm';
                                      }
                                      if (isSaved) {
                                        return 'border-neutral-300 bg-neutral-200';
                                      }
                                      if (isSelected) {
                                        return 'border-blue-400 bg-blue-50 shadow-sm';
                                      }
                                      return 'border-blue-200 bg-blue-50';
                                    })()}`}
                                  >
                                    <p className="w-full whitespace-pre-wrap break-words text-center text-xs font-semibold leading-tight text-neutral-800">
                                      {entry.className}
                                    </p>
                                    {entry.location ? (
                                      <p className="flex h-4 w-full items-center justify-center overflow-hidden rounded-full bg-neutral-900/10 px-1 text-center text-[10px] font-medium text-neutral-700">
                                        <span className="block w-full truncate whitespace-nowrap">{entry.location}</span>
                                      </p>
                                    ) : null}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}

                  {hasFullOnDemandRow ? (
                    <>
                      <div
                        className="flex h-full w-full items-center justify-center border-b border-r border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600"
                        style={{ gridColumnStart: 1, gridRowStart: regularPeriodLabels.length + 2 }}
                      >
                        <span className="block w-full truncate">FOD</span>
                      </div>
                      <div
                        className="flex min-h-0 w-full flex-col border-b border-r border-neutral-200 bg-white"
                        style={{
                          gridColumnStart: 2,
                          gridColumnEnd: WEEKDAY_HEADERS.length + 2,
                          gridRowStart: regularPeriodLabels.length + 2,
                        }}
                      >
                        {fullOnDemandEntries.length > 0 ? (
                          <div className="flex h-full min-h-0 w-full flex-wrap items-stretch gap-1 p-1">
                            {fullOnDemandEntries.map((entry) => (
                              <button
                                key={entry.classId}
                                type="button"
                                onClick={() => handleSelectClass(entry.classId)}
                                className={`flex min-h-0 flex-1 flex-col gap-1 rounded-lg border px-1 py-1 text-left transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${(() => {
                                  const isSelected = entry.classId === selectedClassId;
                                  const isSaved = savedClassIds.has(entry.classId);
                                  if (isSaved && isSelected) {
                                    return 'border-blue-400 bg-neutral-200 shadow-sm';
                                  }
                                  if (isSaved) {
                                    return 'border-neutral-300 bg-neutral-200';
                                  }
                                  if (isSelected) {
                                    return 'border-blue-400 bg-blue-50 shadow-sm';
                                  }
                                  return 'border-blue-200 bg-blue-50';
                                })()}`}
                                style={{ minWidth: '120px' }}
                              >
                                <p className="w-full whitespace-pre-wrap break-words text-center text-xs font-semibold leading-tight text-neutral-800">
                                  {entry.className}
                                </p>
                                {entry.location ? (
                                  <p className="flex h-4 w-full items-center justify-center overflow-hidden rounded-full bg-neutral-900/10 px-1 text-center text-[10px] font-medium text-neutral-700">
                                    <span className="block w-full truncate whitespace-nowrap">{entry.location}</span>
                                  </p>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center p-3 text-xs text-neutral-500">
                            完全オンデマンドの授業はありません。
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
            </div>
          ) : null}
        </section>
      </main>
      {isDialogOpen && dialogTargetClass ? (
        <CreateClassDialog
          isOpen={isDialogOpen}
          onClose={handleCloseDialog}
          calendarOptions={calendarOptions}
          defaultFiscalYear={settings.calendar.fiscalYear}
          defaultCalendarId={settings.calendar.calendarId}
          userId={userId}
          onCreated={handleCreated}
          presetTermIds={dialogPresetTermIds}
          presetWeeklySlots={dialogPresetWeeklySlots}
          presetFormValues={dialogPresetFormValues}
        />
      ) : null}
    </div>
  );
}
