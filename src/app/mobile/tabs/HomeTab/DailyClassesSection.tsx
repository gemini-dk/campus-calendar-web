'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDays,
  faChalkboardTeacher,
  faCircleQuestion,
  faListCheck,
  faNoteSticky,
  faPlay,
  faPlus,
  faVideo,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/client';

import AttendanceToggleGroup from '@/app/mobile/components/AttendanceToggleGroup';
import AttendanceSummary from '@/app/mobile/components/AttendanceSummary';
import DeliveryToggleGroup from '@/app/mobile/components/DeliveryToggleGroup';
import type {
  AttendanceStatus,
  AttendanceSummary as AttendanceSummaryType,
  DeliveryType,
} from '@/app/mobile/types';
import {
  buildAbsenceMessage,
  ClassType,
  computeAttendanceSummary,
  formatPeriodLabel,
  mapTimetableClassDate,
  type TimetableClassDateDoc,
} from '@/app/mobile/utils/classSchedule';

type TimetableClassDoc = {
  id: string;
  className: string;
  classType: ClassType;
  location: string | null;
  locationInPerson: string | null;
  locationOnline: string | null;
  maxAbsenceDays: number | null;
};

export type DailyClassSession = {
  id: string;
  classId: string;
  classDateId: string;
  className: string;
  classType: ClassType;
  location: string | null;
  locationInPerson: string | null;
  locationOnline: string | null;
  periods: (number | 'OD')[];
  attendanceStatus: AttendanceStatus;
  deliveryType: DeliveryType;
  summary: AttendanceSummaryType;
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
  onSelectClass?: (session: DailyClassSession) => void;
};

const CLASS_TYPE_ICON: Record<ClassType, IconDefinition> = {
  in_person: faChalkboardTeacher,
  online: faVideo,
  on_demand: faPlay,
  hybrid: faCircleQuestion,
};

const CLASS_TYPE_ICON_CLASS: Record<ClassType, string> = {
  in_person: 'text-neutral-500',
  online: 'text-neutral-500',
  on_demand: 'text-neutral-500',
  hybrid: 'text-neutral-500',
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

  const locationInPerson =
    typeof data.locationInPerson === 'string' && data.locationInPerson.trim().length > 0
      ? data.locationInPerson.trim()
      : classType === 'hybrid'
        ? location
        : null;

  const locationOnline =
    typeof data.locationOnline === 'string' && data.locationOnline.trim().length > 0
      ? data.locationOnline.trim()
      : classType === 'hybrid'
        ? location
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
    locationInPerson,
    locationOnline,
    maxAbsenceDays,
  } satisfies TimetableClassDoc;
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
      left.locationInPerson !== right.locationInPerson ||
      left.locationOnline !== right.locationOnline ||
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

type SessionLocationDisplay = {
  icon: IconDefinition;
  iconClass: string;
  label: string;
  link: string | null;
};

function buildSessionLocationDisplay(session: DailyClassSession): SessionLocationDisplay {
  if (session.classType !== 'hybrid') {
    const rawLocation = session.location ?? '';
    const trimmed = rawLocation.trim();
    return {
      icon: CLASS_TYPE_ICON[session.classType],
      iconClass: CLASS_TYPE_ICON_CLASS[session.classType],
      label: trimmed.length > 0 ? trimmed : '場所未設定',
      link: isProbablyUrl(rawLocation) ? rawLocation : null,
    } satisfies SessionLocationDisplay;
  }

  if (session.deliveryType === 'in_person') {
    const rawLocation = session.locationInPerson ?? '';
    const trimmed = rawLocation.trim();
    return {
      icon: faChalkboardTeacher,
      iconClass: CLASS_TYPE_ICON_CLASS.in_person,
      label: trimmed.length > 0 ? trimmed : '場所未設定',
      link: isProbablyUrl(rawLocation) ? rawLocation : null,
    } satisfies SessionLocationDisplay;
  }

  if (session.deliveryType === 'remote') {
    const rawLocation = session.locationOnline ?? '';
    const trimmed = rawLocation.trim();
    return {
      icon: faVideo,
      iconClass: CLASS_TYPE_ICON_CLASS.online,
      label: trimmed.length > 0 ? trimmed : '場所未設定',
      link: isProbablyUrl(rawLocation) ? rawLocation : null,
    } satisfies SessionLocationDisplay;
  }

  return {
    icon: faCircleQuestion,
    iconClass: CLASS_TYPE_ICON_CLASS.hybrid,
    label: '未確定',
    link: null,
  } satisfies SessionLocationDisplay;
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
      const classRef = doc(
        db,
        'users',
        userId,
        'academic_years',
        fiscalYear,
        'timetable_classes',
        classItem.id,
      );
      const classDatesCollection = collection(classRef, 'class_dates');
      const classDatesQuery = query(classDatesCollection, orderBy('classDate', 'desc'));

      const unsubscribe = onSnapshot(
        classDatesQuery,
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
          locationInPerson: classItem.locationInPerson,
          locationOnline: classItem.locationOnline,
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
  onSelectClass,
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
              onSelectClass={onSelectClass}
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
  onSelectClass?: (session: DailyClassSession) => void;
};

function DailyClassCard({ session, onChangeAttendance, onChangeDeliveryType, onSelectClass }: DailyClassCardProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [attendanceUpdating, setAttendanceUpdating] = useState(false);
  const [deliveryUpdating, setDeliveryUpdating] = useState(false);

  const periodLabel = formatPeriodLabel(session.periods);
  const locationInfo = buildSessionLocationDisplay(session);

  const absenceMessage = buildAbsenceMessage(session.summary);
  const absenceRatioLabel =
    session.summary.maxAbsenceDays === null
      ? `欠席数: ${session.summary.absentCount}`
      : `${session.summary.absentCount}/${session.summary.maxAbsenceDays}`;

  const isPastOrToday = session.daysFromToday <= 0;
  const isTomorrowOrLater = session.daysFromToday >= 1;
  const showDeliveryToggle = isTomorrowOrLater && session.classType === 'hybrid';
  const showRightSideActions = isPastOrToday || showDeliveryToggle || isTomorrowOrLater;

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

  const handleCardClick = () => {
    if (onSelectClass) {
      onSelectClass(session);
    }
  };

  const handleInteractiveClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <li
      className={`flex w-full flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-sm ${
        onSelectClass ? 'cursor-pointer transition hover:border-blue-200 hover:shadow-md' : ''
      }`.trim()}
      onClick={onSelectClass ? handleCardClick : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
          {periodLabel}
        </span>
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-500">
          <FontAwesomeIcon
            icon={locationInfo.icon}
            className={`text-base ${locationInfo.iconClass}`}
            aria-hidden="true"
          />
          <span className="text-neutral-500">
            {locationInfo.link ? (
              <a
                href={locationInfo.link}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-neutral-500 underline-offset-2 hover:text-neutral-600 hover:underline"
                onClick={handleInteractiveClick}
              >
                {locationInfo.label}
              </a>
            ) : (
              locationInfo.label
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
        <h3 className="mb-2 text-[1.125rem] text-neutral-900 text-center">{session.className}</h3>
      </div>

      <AttendanceSummary
        summary={session.summary}
        absenceMessage={absenceMessage}
        absenceRatioLabel={absenceRatioLabel}
      />

      <div className="flex w-full flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <ActionButton
            icon={faListCheck}
            label="課題作成"
            showCreateIndicator
            onClick={handleInteractiveClick}
          />
          <ActionButton
            icon={faNoteSticky}
            label="メモ作成"
            showCreateIndicator
            onClick={handleInteractiveClick}
          />
        </div>
        {showRightSideActions ? (
          <div className="ml-auto flex items-center gap-2" onClick={handleInteractiveClick}>
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
              <ActionButton
                icon={faCalendarDays}
                label="日程変更"
                variant="neutral"
                onClick={handleInteractiveClick}
              />
            ) : null}
          </div>
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
  showCreateIndicator?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
};

function ActionButton({
  icon,
  label,
  variant = 'blue',
  showCreateIndicator = false,
  onClick,
}: ActionButtonProps) {
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
      onClick={onClick}
    >
      <span className="relative flex items-center justify-center">
        <FontAwesomeIcon icon={icon} className="text-lg" aria-hidden="true" />
        {showCreateIndicator ? (
          <span className="absolute -bottom-1 -right-1 flex h-[0.875rem] w-[0.875rem] items-center justify-center rounded-full bg-white text-[0.5rem] text-blue-600 ring-1 ring-blue-200">
            <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
          </span>
        ) : null}
      </span>
    </button>
  );
}
