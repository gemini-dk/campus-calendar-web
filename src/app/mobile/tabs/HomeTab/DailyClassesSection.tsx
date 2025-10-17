'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDays,
  faChalkboardTeacher,
  faCircleCheck,
  faCircleQuestion,
  faCircleXmark,
  faListCheck,
  faNoteSticky,
  faPlay,
  faTriangleExclamation,
  faVideo,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/client';

type AttendanceStatus = 'present' | 'late' | 'absent' | null;
type DeliveryType = 'unknown' | 'in_person' | 'remote';
type ClassType = 'in_person' | 'online' | 'hybrid' | 'on_demand';

type TimetableClassDoc = {
  id: string;
  className: string;
  classType: ClassType;
  location: string | null;
  maxAbsenceDays: number | null;
};

type TimetableClassDateDoc = {
  id: string;
  classDate: string;
  periods: (number | 'OD')[];
  attendanceStatus: AttendanceStatus;
  isTest: boolean;
  isExcludedFromSummary: boolean;
  isCancelled: boolean;
  deliveryType: DeliveryType;
  hasUserModifications: boolean;
};

type AttendanceSummary = {
  presentCount: number;
  absentCount: number;
  lateCount: number;
  unrecordedCount: number;
  totalCount: number;
  maxAbsenceDays: number | null;
};

type DailyClassSession = {
  id: string;
  classId: string;
  classDateId: string;
  className: string;
  classType: ClassType;
  location: string | null;
  periods: (number | 'OD')[];
  attendanceStatus: AttendanceStatus;
  deliveryType: DeliveryType;
  summary: AttendanceSummary;
  isTest: boolean;
  isCancelled: boolean;
  daysFromToday: number;
};

type UseDailyClassSessionsParams = {
  userId: string | null;
  fiscalYear: string | null;
  dateId: string;
};

type UseDailyClassSessionsResult = {
  loading: boolean;
  error: string | null;
  sessions: DailyClassSession[];
  requiresSetup: boolean;
  updateAttendanceStatus: (
    classId: string,
    classDateId: string,
    status: AttendanceStatus,
  ) => Promise<void>;
  updateDeliveryType: (
    classId: string,
    classDateId: string,
    deliveryType: DeliveryType,
  ) => Promise<void>;
};

type DailyClassesSectionProps = {
  userId: string | null;
  fiscalYear: string | null;
  dateId: string;
  authInitializing: boolean;
  isAuthenticated: boolean;
};

const ATTENDANCE_STATUS_VALUES = new Set(['present', 'late', 'absent']);
const DELIVERY_TYPE_VALUES = new Set(['unknown', 'in_person', 'remote']);

const CLASS_TYPE_ICON: Record<ClassType, IconDefinition> = {
  in_person: faChalkboardTeacher,
  online: faVideo,
  on_demand: faPlay,
  hybrid: faCircleQuestion,
};

const CLASS_TYPE_ICON_CLASS: Record<ClassType, string> = {
  in_person: 'text-blue-600',
  online: 'text-purple-600',
  on_demand: 'text-amber-500',
  hybrid: 'text-sky-600',
};

function getTodayId(): string {
  return new Date().toISOString().slice(0, 10);
}

function calculateDaysFromToday(targetId: string, todayId: string): number {
  const target = new Date(`${targetId}T00:00:00`);
  const today = new Date(`${todayId}T00:00:00`);
  const diff = target.getTime() - today.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function mapTimetableClass(
  docSnapshot: QueryDocumentSnapshot<DocumentData>,
): TimetableClassDoc | null {
  const data = docSnapshot.data();
  const className = typeof data.className === 'string' ? data.className.trim() : '';
  if (!className) {
    return null;
  }

  const typeValue = typeof data.classType === 'string' ? data.classType : 'in_person';
  const classType: ClassType = CLASS_TYPE_ICON[typeValue as ClassType]
    ? (typeValue as ClassType)
    : 'in_person';

  const location =
    typeof data.location === 'string' && data.location.trim().length > 0
      ? data.location.trim()
      : null;

  const maxAbsenceDays =
    typeof data.maxAbsenceDays === 'number' && Number.isFinite(data.maxAbsenceDays)
      ? Math.max(0, Math.trunc(data.maxAbsenceDays))
      : null;

  return {
    id: docSnapshot.id,
    className,
    classType,
    location,
    maxAbsenceDays,
  } satisfies TimetableClassDoc;
}

function mapTimetableClassDate(
  docSnapshot: QueryDocumentSnapshot<DocumentData>,
): TimetableClassDateDoc | null {
  const data = docSnapshot.data();
  const classDate = typeof data.classDate === 'string' ? data.classDate : null;
  if (!classDate) {
    return null;
  }

  const periodsRaw = Array.isArray(data.periods) ? data.periods : [];
  const periods = periodsRaw
    .map((period) => {
      if (period === 'OD') {
        return 'OD';
      }
      if (typeof period === 'number' && Number.isFinite(period) && period > 0) {
        return Math.trunc(period);
      }
      return null;
    })
    .filter((period): period is number | 'OD' => period === 'OD' || period !== null);

  const attendanceStatus =
    typeof data.attendanceStatus === 'string' && ATTENDANCE_STATUS_VALUES.has(data.attendanceStatus)
      ? (data.attendanceStatus as Exclude<AttendanceStatus, null>)
      : null;

  const deliveryType =
    typeof data.deliveryType === 'string' && DELIVERY_TYPE_VALUES.has(data.deliveryType)
      ? (data.deliveryType as DeliveryType)
      : 'unknown';

  return {
    id: docSnapshot.id,
    classDate,
    periods,
    attendanceStatus,
    isTest: data.isTest === true,
    isExcludedFromSummary: data.isExcludedFromSummary === true,
    isCancelled: data.isCancelled === true,
    deliveryType,
    hasUserModifications: data.hasUserModifications === true,
  } satisfies TimetableClassDateDoc;
}

function computeAttendanceSummary(
  items: TimetableClassDateDoc[],
  todayId: string,
  maxAbsenceDays: number | null,
): AttendanceSummary {
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let unrecordedCount = 0;
  let totalCount = 0;

  for (const item of items) {
    if (item.isExcludedFromSummary || item.isCancelled) {
      continue;
    }

    totalCount += 1;

    switch (item.attendanceStatus) {
      case 'present':
        presentCount += 1;
        break;
      case 'late':
        lateCount += 1;
        break;
      case 'absent':
        absentCount += 1;
        break;
      default:
        if (item.classDate <= todayId) {
          unrecordedCount += 1;
        }
        break;
    }
  }

  return {
    presentCount,
    lateCount,
    absentCount,
    unrecordedCount,
    totalCount,
    maxAbsenceDays,
  } satisfies AttendanceSummary;
}

function areClassListsEqual(a: TimetableClassDoc[], b: TimetableClassDoc[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = [...a].sort((x, y) => x.id.localeCompare(y.id));
  const sortedB = [...b].sort((x, y) => x.id.localeCompare(y.id));

  for (let index = 0; index < sortedA.length; index += 1) {
    const left = sortedA[index];
    const right = sortedB[index];
    if (
      left.id !== right.id ||
      left.className !== right.className ||
      left.classType !== right.classType ||
      left.location !== right.location ||
      left.maxAbsenceDays !== right.maxAbsenceDays
    ) {
      return false;
    }
  }

  return true;
}

function getPeriodSortKey(periods: (number | 'OD')[]): number {
  const numeric = periods.filter((period): period is number => typeof period === 'number');
  if (numeric.length > 0) {
    return Math.min(...numeric);
  }
  if (periods.includes('OD')) {
    return 999;
  }
  return 998;
}

function formatPeriodLabel(periods: (number | 'OD')[]): string {
  if (periods.length === 0) {
    return '時限未設定';
  }
  const numeric = periods
    .filter((period): period is number => typeof period === 'number')
    .sort((a, b) => a - b);
  const hasOnDemand = periods.includes('OD');
  if (numeric.length === 0 && hasOnDemand) {
    return 'オンデマンド';
  }
  if (numeric.length > 0) {
    const base = `${numeric.join(',')}限`;
    return hasOnDemand ? `${base} / オンデマンド` : base;
  }
  return '時限未設定';
}

function isProbablyUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

function buildAbsenceMessage(summary: AttendanceSummary): string | null {
  if (summary.maxAbsenceDays === null) {
    return null;
  }
  if (summary.maxAbsenceDays <= 0) {
    return '欠席可能日数は設定されていません。';
  }
  const remaining = summary.maxAbsenceDays - summary.absentCount;
  if (remaining > 1) {
    return `あと${remaining}日欠席可能です。`;
  }
  if (remaining === 1) {
    return 'あと1日欠席可能です。';
  }
  if (remaining === 0) {
    return '欠席可能日数は残り0日です。';
  }
  return `欠席可能日数を${Math.abs(remaining)}日超過しています。`;
}
function useDailyClassSessions({
  userId,
  fiscalYear,
  dateId,
}: UseDailyClassSessionsParams): UseDailyClassSessionsResult {
  const [classes, setClasses] = useState<TimetableClassDoc[]>([]);
  const [classDateRecords, setClassDateRecords] = useState<Record<string, TimetableClassDateDoc[]>>({});
  const [initializedClassDates, setInitializedClassDates] = useState<Record<string, true>>({});
  const [classesLoading, setClassesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [todayId, setTodayId] = useState<string>(dateId);

  useEffect(() => {
    const resolvedTodayId = getTodayId();
    if (resolvedTodayId !== todayId) {
      setTodayId(resolvedTodayId);
    }
  }, [todayId]);

  const daysFromToday = useMemo(() => calculateDaysFromToday(dateId, todayId), [dateId, todayId]);

  useEffect(() => {
    if (!userId || !fiscalYear) {
      setClasses([]);
      setClassDateRecords({});
      setInitializedClassDates({});
      setClassesLoading(false);
      setError(null);
      return () => {};
    }

    setClassesLoading(true);
    setError(null);

    const classesCollection = collection(
      db,
      'users',
      userId,
      'academic_years',
      fiscalYear,
      'timetable_classes',
    );

    const unsubscribe = onSnapshot(
      classesCollection,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((docSnapshot) => mapTimetableClass(docSnapshot))
          .filter((item): item is TimetableClassDoc => item !== null);

        setClasses((prev) => {
          if (areClassListsEqual(prev, mapped)) {
            return prev;
          }
          return mapped;
        });
        setClassesLoading(false);
      },
      (err) => {
        console.error('Failed to load timetable classes', err);
        setClasses([]);
        setClassDateRecords({});
        setInitializedClassDates({});
        setClassesLoading(false);
        setError('授業情報の取得に失敗しました。');
      },
    );

    return () => {
      unsubscribe();
    };
  }, [userId, fiscalYear]);

  useEffect(() => {
    setClassDateRecords({});
    setInitializedClassDates({});
  }, [userId, fiscalYear]);

  useEffect(() => {
    if (!userId || !fiscalYear || classes.length === 0) {
      setClassDateRecords({});
      setInitializedClassDates({});
      return () => {};
    }

    const unsubscribers: Unsubscribe[] = [];

    for (const classItem of classes) {
      const classDatesCollection = collection(
        db,
        'users',
        userId,
        'academic_years',
        fiscalYear,
        'timetable_classes',
        classItem.id,
        'class_dates',
      );

      const unsubscribe = onSnapshot(
        classDatesCollection,
        (snapshot) => {
          const mapped = snapshot.docs
            .map((docSnapshot) => mapTimetableClassDate(docSnapshot))
            .filter((item): item is TimetableClassDateDoc => item !== null);

          setClassDateRecords((prev) => {
            const next = { ...prev, [classItem.id]: mapped };
            return next;
          });
          setInitializedClassDates((prev) => {
            if (prev[classItem.id]) {
              return prev;
            }
            return { ...prev, [classItem.id]: true };
          });
        },
        (err) => {
          console.error('Failed to load class dates', err);
          setClassDateRecords((prev) => {
            const next = { ...prev };
            delete next[classItem.id];
            return next;
          });
          setInitializedClassDates((prev) => {
            if (prev[classItem.id]) {
              return prev;
            }
            return { ...prev, [classItem.id]: true };
          });
        },
      );

      unsubscribers.push(unsubscribe);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
    };
  }, [classes, userId, fiscalYear]);

  const sessions = useMemo(() => {
    if (classes.length === 0) {
      return [] as DailyClassSession[];
    }

    const results: DailyClassSession[] = [];

    for (const classItem of classes) {
      const dates = classDateRecords[classItem.id] ?? [];
      const summary = computeAttendanceSummary(dates, todayId, classItem.maxAbsenceDays);

      for (const dateItem of dates) {
        if (dateItem.classDate !== dateId) {
          continue;
        }

        results.push({
          id: `${classItem.id}#${dateItem.id}`,
          classId: classItem.id,
          classDateId: dateItem.id,
          className: classItem.className,
          classType: classItem.classType,
          location: classItem.location,
          periods: dateItem.periods,
          attendanceStatus: dateItem.attendanceStatus,
          deliveryType: dateItem.deliveryType,
          summary,
          isTest: dateItem.isTest,
          isCancelled: dateItem.isCancelled,
          daysFromToday,
        });
      }
    }

    return results.sort((a, b) => {
      const periodOrder = getPeriodSortKey(a.periods) - getPeriodSortKey(b.periods);
      if (periodOrder !== 0) {
        return periodOrder;
      }
      return a.className.localeCompare(b.className, 'ja');
    });
  }, [classes, classDateRecords, dateId, todayId, daysFromToday]);

  const initializedCount = Object.keys(initializedClassDates).length;
  const datesLoading = classes.length > 0 && initializedCount < classes.length;
  const loading = classesLoading || datesLoading;

  const updateAttendanceStatus = useCallback(
    async (classId: string, classDateId: string, status: AttendanceStatus) => {
      if (!userId || !fiscalYear) {
        throw new Error('ユーザー情報または年度情報が不足しています。');
      }

      const docRef = doc(
        db,
        'users',
        userId,
        'academic_years',
        fiscalYear,
        'timetable_classes',
        classId,
        'class_dates',
        classDateId,
      );

      const payload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      payload.attendanceStatus = status ?? null;

      await updateDoc(docRef, payload);
    },
    [userId, fiscalYear],
  );

  const updateDeliveryType = useCallback(
    async (classId: string, classDateId: string, deliveryType: DeliveryType) => {
      if (!userId || !fiscalYear) {
        throw new Error('ユーザー情報または年度情報が不足しています。');
      }

      const docRef = doc(
        db,
        'users',
        userId,
        'academic_years',
        fiscalYear,
        'timetable_classes',
        classId,
        'class_dates',
        classDateId,
      );

      await updateDoc(docRef, {
        deliveryType,
        updatedAt: serverTimestamp(),
      });
    },
    [userId, fiscalYear],
  );

  const requiresSetup = Boolean(userId) && (!fiscalYear || fiscalYear.trim().length === 0);

  return {
    loading,
    error,
    sessions,
    requiresSetup,
    updateAttendanceStatus,
    updateDeliveryType,
  } satisfies UseDailyClassSessionsResult;
}

export default function DailyClassesSection({
  userId,
  fiscalYear,
  dateId,
  authInitializing,
  isAuthenticated,
}: DailyClassesSectionProps) {
  const { loading, error, sessions, requiresSetup, updateAttendanceStatus, updateDeliveryType } =
    useDailyClassSessions({ userId, fiscalYear, dateId });

  if (authInitializing) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-sm text-neutral-600">
        認証情報を確認しています...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-sm text-neutral-600">
        授業を確認するにはログインしてください。ユーザタブからサインインできます。
      </div>
    );
  }

  if (requiresSetup) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-sm text-neutral-600">
        学事カレンダー設定が未入力です。設定タブで年度とカレンダーを保存してください。
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-sm text-neutral-600">
          授業情報を読み込んでいます...
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-sm text-neutral-500">
          本日の授業は登録されていません。
        </div>
      ) : (
        <ul className="flex w-full flex-col gap-3">
          {sessions.map((session) => (
            <DailyClassCard
              key={session.id}
              session={session}
              onChangeAttendance={updateAttendanceStatus}
              onChangeDeliveryType={updateDeliveryType}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type DailyClassCardProps = {
  session: DailyClassSession;
  onChangeAttendance: (
    classId: string,
    classDateId: string,
    status: AttendanceStatus,
  ) => Promise<void>;
  onChangeDeliveryType: (
    classId: string,
    classDateId: string,
    deliveryType: DeliveryType,
  ) => Promise<void>;
};

function DailyClassCard({ session, onChangeAttendance, onChangeDeliveryType }: DailyClassCardProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [attendanceUpdating, setAttendanceUpdating] = useState(false);
  const [deliveryUpdating, setDeliveryUpdating] = useState(false);

  const periodLabel = formatPeriodLabel(session.periods);
  const classIcon = CLASS_TYPE_ICON[session.classType];
  const iconClass = CLASS_TYPE_ICON_CLASS[session.classType];

  const absenceMessage = buildAbsenceMessage(session.summary);
  const absenceRatioLabel =
    session.summary.maxAbsenceDays === null
      ? `欠席数: ${session.summary.absentCount}`
      : `${session.summary.absentCount}/${session.summary.maxAbsenceDays}`;

  const isPastOrToday = session.daysFromToday <= 0;
  const isTomorrowOrLater = session.daysFromToday >= 1;
  const showDeliveryToggle = isTomorrowOrLater && session.classType === 'hybrid';

  const progressSegments = useMemo(() => {
    const total = Math.max(session.summary.totalCount, 1);
    const toPercent = (value: number) => Math.max(0, Math.min(100, (value / total) * 100));
    return {
      present: toPercent(session.summary.presentCount),
      late: toPercent(session.summary.lateCount),
      unrecorded: toPercent(session.summary.unrecordedCount),
      absent: toPercent(session.summary.absentCount),
    };
  }, [session.summary]);

  const handleAttendanceChange = useCallback(
    async (nextStatus: AttendanceStatus) => {
      setActionError(null);
      setAttendanceUpdating(true);
      try {
        await onChangeAttendance(session.classId, session.classDateId, nextStatus);
      } catch (err) {
        console.error('Failed to update attendance status', err);
        setActionError('出欠情報の更新に失敗しました。時間をおいて再度お試しください。');
      } finally {
        setAttendanceUpdating(false);
      }
    },
    [onChangeAttendance, session.classId, session.classDateId],
  );

  const handleDeliveryChange = useCallback(
    async (nextType: DeliveryType) => {
      setActionError(null);
      setDeliveryUpdating(true);
      try {
        await onChangeDeliveryType(session.classId, session.classDateId, nextType);
      } catch (err) {
        console.error('Failed to update delivery type', err);
        setActionError('授業形態の更新に失敗しました。時間をおいて再度お試しください。');
      } finally {
        setDeliveryUpdating(false);
      }
    },
    [onChangeDeliveryType, session.classId, session.classDateId],
  );

  return (
    <li className="flex w-full flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
          {periodLabel}
        </span>
        <span className={`flex items-center gap-2 text-sm font-medium text-neutral-600 ${iconClass}`}>
          <FontAwesomeIcon icon={classIcon} className="text-base" aria-hidden="true" />
          <span className="text-neutral-600">
            {isProbablyUrl(session.location) ? (
              <a
                href={session.location}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 underline-offset-2 hover:underline"
              >
                {session.location}
              </a>
            ) : session.location ? (
              session.location
            ) : (
              '場所未設定'
            )}
          </span>
        </span>
        {session.isTest ? (
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-600">
            試験
          </span>
        ) : null}
        {session.isCancelled ? (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">
            休講
          </span>
        ) : null}
      </div>

      <div className="flex flex-col">
        <h3 className="text-lg font-semibold text-neutral-900">{session.className}</h3>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold text-emerald-600">{session.summary.presentCount}</span>
            <span className="text-sm text-neutral-600">
              /{session.summary.totalCount}{' '}
              <span className="text-neutral-500">(遅刻: {session.summary.lateCount}, 未入力: {session.summary.unrecordedCount})</span>
            </span>
          </div>
          <div className="text-sm font-semibold text-red-500">{absenceRatioLabel}</div>
        </div>
        <div className="relative flex h-3 w-full overflow-hidden rounded-full bg-neutral-200">
          <div className="flex h-full w-full">
            <span style={{ width: `${progressSegments.present}%` }} className="h-full bg-emerald-500" />
            <span style={{ width: `${progressSegments.late}%` }} className="h-full bg-orange-400" />
            <span style={{ width: `${progressSegments.unrecorded}%` }} className="h-full bg-neutral-400" />
          </div>
          <span
            style={{ width: `${progressSegments.absent}%` }}
            className="absolute right-0 top-0 h-full bg-red-500"
          />
        </div>
        {absenceMessage ? (
          <p className="text-xs text-red-500">{absenceMessage}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton icon={faListCheck} label="課題作成" />
        <ActionButton icon={faNoteSticky} label="メモ作成" variant="purple" />
        {isPastOrToday ? (
          <AttendanceToggleGroup
            value={session.attendanceStatus}
            disabled={attendanceUpdating}
            onChange={handleAttendanceChange}
          />
        ) : null}
        {showDeliveryToggle ? (
          <DeliveryToggleGroup
            value={session.deliveryType}
            disabled={deliveryUpdating}
            onChange={handleDeliveryChange}
          />
        ) : null}
        {isTomorrowOrLater ? (
          <ActionButton icon={faCalendarDays} label="日程変更" variant="neutral" />
        ) : null}
      </div>

      {actionError ? (
        <p className="text-xs text-red-500">{actionError}</p>
      ) : null}
    </li>
  );
}

type ActionButtonProps = {
  icon: IconDefinition;
  label: string;
  variant?: 'blue' | 'purple' | 'neutral';
};

function ActionButton({ icon, label, variant = 'blue' }: ActionButtonProps) {
  const variantClass = (() => {
    switch (variant) {
      case 'purple':
        return 'bg-violet-50 text-violet-600 hover:bg-violet-100';
      case 'neutral':
        return 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200';
      case 'blue':
      default:
        return 'bg-blue-50 text-blue-600 hover:bg-blue-100';
    }
  })();

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition ${variantClass}`}
    >
      <FontAwesomeIcon icon={icon} className="text-lg" aria-hidden="true" />
    </button>
  );
}

type AttendanceToggleGroupProps = {
  value: AttendanceStatus;
  onChange: (value: AttendanceStatus) => void;
  disabled?: boolean;
};

const ATTENDANCE_OPTIONS: {
  value: Exclude<AttendanceStatus, null>;
  icon: IconDefinition;
  label: string;
  activeClass: string;
}[] = [
  {
    value: 'present',
    icon: faCircleCheck,
    label: '出席',
    activeClass: 'bg-emerald-100 text-emerald-600',
  },
  {
    value: 'late',
    icon: faTriangleExclamation,
    label: '遅刻',
    activeClass: 'bg-orange-100 text-orange-600',
  },
  {
    value: 'absent',
    icon: faCircleXmark,
    label: '欠席',
    activeClass: 'bg-red-100 text-red-600',
  },
];

function AttendanceToggleGroup({ value, onChange, disabled }: AttendanceToggleGroupProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-2 shadow-sm">
      {ATTENDANCE_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(isActive ? null : option.value)}
            disabled={disabled}
            aria-pressed={isActive}
            className={`flex h-[45px] w-[45px] items-center justify-center rounded-full transition ${
              isActive
                ? option.activeClass
                : 'bg-transparent text-neutral-400 hover:bg-neutral-100'
            } disabled:cursor-not-allowed disabled:opacity-60`}
            aria-label={option.label}
          >
            <FontAwesomeIcon icon={option.icon} className="text-[40px]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

type DeliveryToggleGroupProps = {
  value: DeliveryType;
  onChange: (value: DeliveryType) => void;
  disabled?: boolean;
};

const DELIVERY_OPTIONS: {
  value: DeliveryType;
  icon: IconDefinition;
  label: string;
  activeClass: string;
}[] = [
  {
    value: 'in_person',
    icon: faChalkboardTeacher,
    label: '対面',
    activeClass: 'bg-blue-100 text-blue-600',
  },
  {
    value: 'remote',
    icon: faVideo,
    label: 'オンライン',
    activeClass: 'bg-purple-100 text-purple-600',
  },
];

function DeliveryToggleGroup({ value, onChange, disabled }: DeliveryToggleGroupProps) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      {DELIVERY_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(isActive ? 'unknown' : option.value)}
            disabled={disabled}
            aria-pressed={isActive}
            className={`flex h-14 w-14 flex-col items-center justify-center rounded-full text-[10px] font-semibold transition ${
              isActive
                ? option.activeClass
                : 'bg-transparent text-neutral-400 hover:bg-neutral-100'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <FontAwesomeIcon icon={option.icon} className="text-base" aria-hidden="true" />
            <span className="mt-1">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
