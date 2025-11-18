'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/client';
import type { CalendarEntry } from '@/lib/settings/UserSettingsProvider';
import { createClassDateSchedule } from '@/lib/data/service/class.service';
import { formatPeriodLabel, type ClassType } from '@/app/mobile/utils/classSchedule';
import {
  PeriodRow,
  type PeriodValue,
  buildCalendarCells,
  formatMonthLabel,
  sortPeriods,
  startOfMonth,
} from './ScheduleDialogShared';

type ClassOption = {
  id: string;
  className: string;
  classType: ClassType;
};

function mapClassOption(docSnapshot: QueryDocumentSnapshot<DocumentData>): ClassOption | null {
  const data = docSnapshot.data();
  const className = typeof data.className === 'string' ? data.className.trim() : '';
  if (!className) {
    return null;
  }
  const rawType = typeof data.classType === 'string' ? data.classType.trim() : '';
  const classType: ClassType =
    rawType === 'online' || rawType === 'hybrid' || rawType === 'on_demand'
      ? (rawType as ClassType)
      : 'in_person';

  return {
    id: docSnapshot.id,
    className,
    classType,
  };
}

type CreateClassScheduleDialogProps = {
  open: boolean;
  userId: string | null;
  fiscalYear: string | null;
  defaultDateId: string;
  lessonsPerDayEntries: CalendarEntry[];
  onClose: () => void;
};

export default function CreateClassScheduleDialog({
  open,
  userId,
  fiscalYear,
  defaultDateId,
  lessonsPerDayEntries,
  onClose,
}: CreateClassScheduleDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState<Date | null>(null);
  const [selectedPeriods, setSelectedPeriods] = useState<PeriodValue[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSelectedPeriods([]);
      setSelectedClassId('');
      setSelectedDate(null);
      setVisibleMonth(null);
      setActionError(null);
      setSubmitting(false);
      return;
    }
    setSelectedDate(defaultDateId);
    setVisibleMonth(startOfMonth(defaultDateId));
    setSelectedPeriods([]);
    setActionError(null);
    setSubmitting(false);
  }, [defaultDateId, open]);

  useEffect(() => {
    if (!open || !userId || !fiscalYear) {
      setClasses([]);
      setClassesLoading(false);
      return () => {};
    }

    setClassesLoading(true);
    const classesRef = collection(db, 'users', userId, 'academic_years', fiscalYear, 'timetable_classes');
    const classesQuery = query(classesRef, orderBy('className'));

    const unsubscribe = onSnapshot(
      classesQuery,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((docSnapshot) => mapClassOption(docSnapshot))
          .filter((item): item is ClassOption => item !== null);
        setClasses(mapped);
        setClassesLoading(false);
      },
      (error) => {
        console.error('Failed to load timetable classes for creation', error);
        setClasses([]);
        setClassesLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [fiscalYear, open, userId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (selectedClassId || classes.length === 0) {
      return;
    }
    setSelectedClassId(classes[0].id);
  }, [classes, open, selectedClassId]);

  const lessonsPerDay = useMemo(() => {
    const entry = lessonsPerDayEntries.find((item) => item.fiscalYear === fiscalYear);
    return entry?.lessonsPerDay ?? 6;
  }, [fiscalYear, lessonsPerDayEntries]);

  const periodNumbers = useMemo(() => {
    return Array.from({ length: Math.max(lessonsPerDay, 0) }, (_, index) => index + 1);
  }, [lessonsPerDay]);

  const splitIndex = lessonsPerDay <= 6 ? lessonsPerDay : Math.ceil(lessonsPerDay / 2);
  const firstRow = periodNumbers.slice(0, splitIndex);
  const secondRow = lessonsPerDay <= 6 ? [] : periodNumbers.slice(splitIndex);

  const calendarMonth = useMemo(() => visibleMonth ?? startOfMonth(defaultDateId), [defaultDateId, visibleMonth]);
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);
  const monthLabel = useMemo(() => formatMonthLabel(calendarMonth), [calendarMonth]);

  const selectedLabel = useMemo(() => {
    if (selectedPeriods.length === 0) {
      return '未選択';
    }
    return formatPeriodLabel(selectedPeriods);
  }, [selectedPeriods]);

  const handleMonthMove = useCallback(
    (delta: number) => {
      const base = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
      setVisibleMonth(base);
    },
    [calendarMonth],
  );

  const handleSelectDate = useCallback((value: string) => {
    setSelectedDate(value);
  }, []);

  const handleTogglePeriod = useCallback(
    (value: PeriodValue) => {
      setSelectedPeriods((prev) => {
        const exists = prev.some((item) => item === value);
        if (exists) {
          return prev.filter((item) => item !== value);
        }
        return sortPeriods([...prev, value]);
      });
    },
    [],
  );

  const selectedClass = useMemo(() => classes.find((item) => item.id === selectedClassId) ?? null, [classes, selectedClassId]);

  const canSubmit = Boolean(
    open &&
      userId &&
      fiscalYear &&
      selectedClassId &&
      selectedDate &&
      selectedPeriods.length > 0 &&
      !submitting,
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !userId || !fiscalYear || !selectedDate) {
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await createClassDateSchedule({
        userId,
        fiscalYear,
        classId: selectedClassId,
        classDate: selectedDate,
        periods: selectedPeriods,
      });
      onClose();
    } catch (error) {
      console.error('Failed to create class schedule', error);
      setActionError('授業予定の作成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, fiscalYear, onClose, selectedClassId, selectedDate, selectedPeriods, userId]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex h-[100svh] w-full items-center justify-center bg-black/40 px-4 py-6">
      <div className="flex h-full max-h-[640px] w-full max-w-[520px] flex-col rounded-3xl bg-white shadow-xl">
        <div className="flex h-16 w-full items-center justify-between border-b border-neutral-200 px-6">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold text-blue-600">授業予定</p>
            <p className="text-sm font-semibold text-neutral-900">授業日程の新規登録</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200"
          >
            <FontAwesomeIcon icon={faXmark} className="text-lg" aria-hidden="true" />
            <span className="sr-only">閉じる</span>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-900">授業を選択</span>
              {selectedClass ? (
                <span className="text-xs text-neutral-500">{selectedClass.className}</span>
              ) : null}
            </div>
            {classesLoading ? (
              <p className="mt-3 text-sm text-neutral-500">授業を読み込み中です...</p>
            ) : classes.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">その年度の授業が登録されていません。</p>
            ) : (
              <select
                className="mt-3 w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm font-semibold text-neutral-800 shadow-sm focus:border-blue-400 focus:outline-none"
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
              >
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.className}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-600 shadow-sm transition hover:bg-neutral-100"
                onClick={() => handleMonthMove(-1)}
                aria-label="前の月へ"
              >
                <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
              </button>
              <div className="flex flex-col items-center gap-1">
                <span className="text-base font-semibold text-neutral-900">{monthLabel}</span>
                <span className="text-xs text-neutral-500">日付を選択してください</span>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-600 shadow-sm transition hover:bg-neutral-100"
                onClick={() => handleMonthMove(1)}
                aria-label="次の月へ"
              >
                <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-neutral-500">
              {'日月火水木金土'.split('').map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarCells.map((cell) => {
                const isSelected = selectedDate === cell.dateId;
                return (
                  <button
                    type="button"
                    key={cell.dateId}
                    onClick={() => handleSelectDate(cell.dateId)}
                    className={`flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold transition ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : cell.inCurrentMonth
                          ? 'bg-white text-neutral-800 hover:bg-blue-50'
                          : 'bg-white text-neutral-300'
                    }`}
                  >
                    {cell.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-900">時限を選択</span>
              <span className="text-xs text-neutral-500">{selectedLabel}</span>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <PeriodRow periods={firstRow} selectedPeriods={selectedPeriods} onToggle={handleTogglePeriod} />
              {secondRow.length > 0 ? (
                <PeriodRow periods={secondRow} selectedPeriods={selectedPeriods} onToggle={handleTogglePeriod} />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleTogglePeriod('OD')}
                  className={`flex h-10 flex-1 items-center justify-center rounded-full border text-sm font-semibold transition ${
                    selectedPeriods.includes('OD')
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-blue-300'
                  }`}
                >
                  オンデマンド
                </button>
              </div>
            </div>
          </div>

          {actionError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{actionError}</div>
          ) : null}
        </div>
        <div className="flex w-full items-center justify-center border-t border-neutral-200 px-6 py-4">
          <button
            type="button"
            className={`flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold transition ${
              canSubmit ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-neutral-200 text-neutral-500'
            }`}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? '作成中...' : 'この内容で授業予定を作成'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
