'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import CreateActivityDialog from './CreateActivityDialog';
import {
  ActivityStatus,
  type Activity,
  type ActivityFormState,
  type ActivityType,
  createDefaultFormState,
  createFormStateFromActivity,
} from '../features/activities/types';
import { db } from '@/lib/firebase/client';
import {
  listTimetableClassesByYear,
  type TimetableClassSummary,
} from '@/lib/data/service/class.service';
import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';

function parseTimestamp(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value === 'string') {
    const fromString = new Date(value);
    return Number.isNaN(fromString.getTime()) ? null : fromString;
  }
  return null;
}

function mapActivity(docSnapshot: QueryDocumentSnapshot<DocumentData>): Activity {
  const data = docSnapshot.data();

  const type: ActivityType = data.type === 'memo' ? 'memo' : 'assignment';
  const status: ActivityStatus = data.status === 'done' ? 'done' : 'pending';
  const dueDate = typeof data.dueDate === 'string' ? data.dueDate : null;
  const classId =
    typeof data.classId === 'string' && data.classId.trim().length > 0
      ? data.classId.trim()
      : null;

  return {
    id: docSnapshot.id,
    title: typeof data.title === 'string' ? data.title : '',
    notes: typeof data.notes === 'string' ? data.notes : '',
    type,
    status,
    dueDate,
    classId,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  } satisfies Activity;
}

type ActivityDialogOpenOptions = Partial<ActivityFormState> & {
  classLabel?: string;
};

type ActivityDialogContextValue = {
  activities: Activity[];
  assignments: Activity[];
  memos: Activity[];
  loading: boolean;
  error: string | null;
  classOptions: TimetableClassSummary[];
  classNameMap: Map<string, string>;
  openCreateDialog: (
    type: ActivityType,
    options?: ActivityDialogOpenOptions,
  ) => void;
  openEditDialog: (activity: Activity) => void;
  toggleAssignmentStatus: (activity: Activity) => Promise<void>;
};

const ActivityDialogContext = createContext<ActivityDialogContextValue | null>(null);

export function useActivityDialog() {
  const value = useContext(ActivityDialogContext);
  if (!value) {
    throw new Error('useActivityDialog must be used within ActivityDialogProvider');
  }
  return value;
}

export function ActivityDialogProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<ActivityType>('assignment');
  const [formState, setFormState] = useState<ActivityFormState>(() => createDefaultFormState());
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  const [classLabelHints, setClassLabelHints] = useState<Record<string, string>>({});

  const [classOptions, setClassOptions] = useState<TimetableClassSummary[]>([]);

  const { profile } = useAuth();
  const { settings } = useUserSettings();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeFiscalYearSetting = settings.calendar.fiscalYear;
  const trimmedActiveFiscalYear =
    typeof activeFiscalYearSetting === 'string'
      ? activeFiscalYearSetting.trim()
      : '';

  useEffect(() => {
    if (!profile?.uid) {
      setActivities([]);
      setLoading(false);
      setError(null);
      setClassLabelHints({});
      return () => {};
    }

    setLoading(true);
    setError(null);

    const collectionRef = collection(db, 'users', profile.uid, 'activities');
    const activitiesQuery = query(collectionRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      activitiesQuery,
      (snapshot) => {
        const items = snapshot.docs.map(mapActivity);
        setActivities(items);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to fetch activities', err);
        setActivities([]);
        setError('データの取得に失敗しました。時間をおいて再度お試しください。');
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) {
      setClassOptions([]);
      return;
    }

    if (!trimmedActiveFiscalYear) {
      setClassOptions([]);
      return;
    }

    let cancelled = false;

    listTimetableClassesByYear({
      userId: profile.uid,
      fiscalYear: trimmedActiveFiscalYear,
    })
      .then((items) => {
        if (!cancelled) {
          setClassOptions(items);
        }
      })
      .catch((err) => {
        console.error('Failed to list timetable classes for activities', err);
        if (!cancelled) {
          setClassOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile?.uid, trimmedActiveFiscalYear]);

  const assignments = useMemo(
    () => activities.filter((activity) => activity.type === 'assignment'),
    [activities],
  );

  const memos = useMemo(
    () => activities.filter((activity) => activity.type === 'memo'),
    [activities],
  );

  const classNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of classOptions) {
      map.set(option.id, option.className);
    }
    for (const [id, label] of Object.entries(classLabelHints)) {
      if (typeof label === 'string' && label.trim().length > 0) {
        map.set(id, label.trim());
      }
    }
    return map;
  }, [classLabelHints, classOptions]);

  const activeFiscalYearForDialog =
    trimmedActiveFiscalYear.length > 0 ? trimmedActiveFiscalYear : null;

  const selectedClassLabel = (() => {
    const trimmedId = formState.classId.trim();
    if (!trimmedId) {
      return null;
    }
    return classNameMap.get(trimmedId) ?? null;
  })();

  const handleFormChange = useCallback(
    (field: keyof ActivityFormState, value: string | boolean) => {
      setFormState((prev) => ({
        ...prev,
        [field]: field === 'isCompleted' ? Boolean(value) : (value as string),
      }));
    },
    [],
  );

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setDialogError(null);
    setIsSaving(false);
    setSelectedActivity(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!profile?.uid) {
      setDialogError('ログイン状態を確認できませんでした。再度サインインしてください。');
      return;
    }

    setIsSaving(true);
    setDialogError(null);

    const payload: Record<string, unknown> = {
      title: formState.title,
      notes: formState.notes,
      classId: formState.classId.trim().length > 0 ? formState.classId.trim() : null,
      type: dialogType,
      status: dialogType === 'assignment' && formState.isCompleted ? 'done' : 'pending',
      dueDate:
        dialogType === 'assignment' && formState.dueDate.trim().length > 0
          ? formState.dueDate
          : null,
      updatedAt: serverTimestamp(),
    };

    try {
      if (selectedActivity) {
        const docRef = doc(db, 'users', profile.uid, 'activities', selectedActivity.id);
        await updateDoc(docRef, payload);
      } else {
        const parent = collection(db, 'users', profile.uid, 'activities');
        await addDoc(parent, { ...payload, createdAt: serverTimestamp() });
      }
      setIsDialogOpen(false);
      setFormState(createDefaultFormState());
      setSelectedActivity(null);
    } catch (err) {
      console.error('Failed to save activity', err);
      setDialogError('保存に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsSaving(false);
    }
  }, [dialogType, formState, profile?.uid, selectedActivity]);

  const openCreateDialog = useCallback(
    (type: ActivityType, options?: ActivityDialogOpenOptions) => {
      setDialogType(type);
      setFormState({
        ...createDefaultFormState(),
        title: options?.title ?? '',
        notes: options?.notes ?? '',
        classId: options?.classId ?? '',
        dueDate: options?.dueDate ?? '',
        isCompleted: Boolean(options?.isCompleted),
      });
      setDialogError(null);
      setSelectedActivity(null);
      const trimmedClassId =
        typeof options?.classId === 'string' ? options.classId.trim() : '';
      if (trimmedClassId.length > 0) {
        const label =
          typeof options?.classLabel === 'string' && options.classLabel.trim().length > 0
            ? options.classLabel.trim()
            : null;
        if (label) {
          setClassLabelHints((prev) => {
            if (prev[trimmedClassId] === label) {
              return prev;
            }
            return { ...prev, [trimmedClassId]: label };
          });
        }
      }
      setIsDialogOpen(true);
    },
    [],
  );

  const openEditDialog = useCallback((activity: Activity) => {
    setDialogType(activity.type);
    setFormState(createFormStateFromActivity(activity));
    setDialogError(null);
    setSelectedActivity(activity);
    const classId =
      typeof activity.classId === 'string' ? activity.classId.trim() : '';
    if (classId.length > 0) {
      const matchedOption = classOptions.find((option) => option.id === classId);
      if (matchedOption?.className) {
        setClassLabelHints((prev) => {
          if (prev[classId] === matchedOption.className) {
            return prev;
          }
          return { ...prev, [classId]: matchedOption.className };
        });
      }
    }
    setIsDialogOpen(true);
  }, [classOptions]);

  const toggleAssignmentStatus = useCallback(
    async (activity: Activity) => {
      if (!profile?.uid) {
        return;
      }

      try {
        const docRef = doc(db, 'users', profile.uid, 'activities', activity.id);
        const nextStatus: ActivityStatus = activity.status === 'done' ? 'pending' : 'done';
        await updateDoc(docRef, {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Failed to toggle assignment status', err);
      }
    },
    [profile?.uid],
  );

  useEffect(() => {
    const action = searchParams.get('activityAction');
    if (action !== 'create' && action !== 'edit') {
      return;
    }

    if (action === 'create') {
      const typeParam = searchParams.get('activityType');
      const resolvedType: ActivityType = typeParam === 'memo' ? 'memo' : 'assignment';
      const titleParam = searchParams.get('activityTitle') ?? '';
      const classIdParam = searchParams.get('activityClassId') ?? '';
      const dueDateParam = searchParams.get('activityDueDate') ?? '';

      openCreateDialog(resolvedType, {
        title: titleParam,
        classId: classIdParam,
        dueDate: resolvedType === 'assignment' ? dueDateParam : '',
      });
    } else if (action === 'edit') {
      const activityId = searchParams.get('activityId');
      if (!activityId) {
        return;
      }

      const activity = activities.find((item) => item.id === activityId);
      if (!activity) {
        return;
      }

      openEditDialog(activity);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('activityAction');
    params.delete('activityType');
    params.delete('activityTitle');
    params.delete('activityClassId');
    params.delete('activityDueDate');
    params.delete('activityId');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activities, openCreateDialog, openEditDialog, pathname, router, searchParams]);

  useEffect(() => {
    setClassLabelHints((prev) => {
      let next = prev;
      for (const option of classOptions) {
        if (prev[option.id] === option.className) {
          continue;
        }
        if (next === prev) {
          next = { ...prev };
        }
        next[option.id] = option.className;
      }
      return next;
    });
  }, [classOptions]);

  const contextValue = useMemo<ActivityDialogContextValue>(
    () => ({
      activities,
      assignments,
      memos,
      loading,
      error,
      classOptions,
      classNameMap,
      openCreateDialog,
      openEditDialog,
      toggleAssignmentStatus,
    }),
    [
      activities,
      assignments,
      classNameMap,
      classOptions,
      error,
      loading,
      memos,
      openCreateDialog,
      openEditDialog,
      toggleAssignmentStatus,
    ],
  );

  return (
    <ActivityDialogContext.Provider value={contextValue}>
      {children}
      <CreateActivityDialog
        open={isDialogOpen}
        type={dialogType}
        mode={selectedActivity ? 'edit' : 'create'}
        formState={formState}
        onChange={handleFormChange}
        onClose={handleCloseDialog}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        error={dialogError}
        classOptions={classOptions}
        activeFiscalYear={activeFiscalYearForDialog}
        selectedClassLabel={selectedClassLabel}
      />
    </ActivityDialogContext.Provider>
  );
}
