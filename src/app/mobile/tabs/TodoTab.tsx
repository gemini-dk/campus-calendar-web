'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faListCheck,
  faNoteSticky,
  faPlus,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { faSquare, faSquareCheck } from '@fortawesome/free-regular-svg-icons';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/client';
import {
  listTimetableClassesByYear,
  type TimetableClassSummary,
} from '@/lib/data/service/class.service';
import { useUserSettings } from '@/lib/settings/UserSettingsProvider';
import { useAuth } from '@/lib/useAuth';
import UserHamburgerMenu from '../components/UserHamburgerMenu';

type ViewMode = 'todo' | 'memo';

type ActivityType = 'assignment' | 'memo';

type ActivityStatus = 'pending' | 'done';

type Activity = {
  id: string;
  title: string;
  notes: string;
  type: ActivityType;
  status: ActivityStatus;
  dueDate: string | null;
  classId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type ActivityFormState = {
  title: string;
  notes: string;
  classId: string;
  dueDate: string;
  isCompleted: boolean;
};

function createDefaultFormState(): ActivityFormState {
  return {
    title: '',
    notes: '',
    classId: '',
    dueDate: '',
    isCompleted: false,
  };
}

function createFormStateFromActivity(activity: Activity): ActivityFormState {
  return {
    title: activity.title,
    notes: activity.notes,
    classId: activity.classId ?? '',
    dueDate: activity.dueDate ?? '',
    isCompleted: activity.status === 'done',
  } satisfies ActivityFormState;
}

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

function mapActivity(doc: QueryDocumentSnapshot<DocumentData>): Activity {
  const data = doc.data();

  const type: ActivityType = data.type === 'memo' ? 'memo' : 'assignment';
  const status: ActivityStatus = data.status === 'done' ? 'done' : 'pending';
  const dueDate = typeof data.dueDate === 'string' ? data.dueDate : null;
  const classId =
    typeof data.classId === 'string' && data.classId.trim().length > 0
      ? data.classId.trim()
      : null;

  return {
    id: doc.id,
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

function formatDueDateLabel(value: string | null): string {
  if (!value) {
    return '未設定';
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '未設定';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateLabel(value: Date | null): string {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function resolveIcon(type: ActivityType, status: ActivityStatus) {
  if (type === 'memo') {
    return { icon: faNoteSticky, className: 'text-blue-600' };
  }

  if (status === 'done') {
    return { icon: faSquareCheck, className: 'text-emerald-500' };
  }

  return { icon: faSquare, className: 'text-neutral-500' };
}

function ViewToggleButton({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: IconDefinition;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
        isActive
          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
          : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
      }`}
      aria-pressed={isActive}
    >
      <FontAwesomeIcon icon={icon} fontSize={18} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function ActivityListItem({
  activity,
  onSelect,
  onToggleStatus,
  classNameMap,
}: {
  activity: Activity;
  onSelect: (activity: Activity) => void;
  onToggleStatus?: (activity: Activity) => void;
  classNameMap?: Map<string, string>;
}) {
  const { icon, className } = resolveIcon(activity.type, activity.status);
  const dueLabel =
    activity.type === 'assignment' ? formatDueDateLabel(activity.dueDate) : null;
  const classId =
    typeof activity.classId === 'string' && activity.classId.trim().length > 0
      ? activity.classId.trim()
      : null;
  const classLabel = classId ? classNameMap?.get(classId) ?? classId : null;
  const createdLabel = formatDateLabel(activity.createdAt);

  return (
    <article
      className="flex w-full cursor-pointer items-stretch gap-3 rounded-2xl border border-neutral-200 bg-white p-2.5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
      onClick={() => onSelect(activity)}
    >
      <div className="flex w-[50px] flex-shrink-0 items-center justify-center">
        {activity.type === 'assignment' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleStatus?.(activity);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200"
            aria-label={activity.status === 'done' ? '未完了に戻す' : '完了にする'}
          >
            <FontAwesomeIcon icon={icon} fontSize={22} className={className} />
          </button>
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100">
            <FontAwesomeIcon icon={icon} fontSize={22} className={className} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <h3 className="truncate text-base font-semibold text-neutral-900">
          {activity.title || '無題の項目'}
        </h3>
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <div className="flex flex-wrap items-center gap-2">
            {dueLabel ? (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-700">
                {dueLabel}
              </span>
            ) : null}
            {classLabel ? (
              <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 font-medium text-neutral-700">
                {classLabel}
              </span>
            ) : null}
          </div>
          <span className="whitespace-nowrap text-neutral-400">作成日 {createdLabel}</span>
        </div>
      </div>
    </article>
  );
}

function TodoList({
  items,
  loading,
  error,
  onSelect,
  onToggleStatus,
  classNameMap,
}: {
  items: Activity[];
  loading: boolean;
  error: string | null;
  onSelect: (activity: Activity) => void;
  onToggleStatus: (activity: Activity) => void;
  classNameMap?: Map<string, string>;
}) {
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
        読み込み中です...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
        課題はまだ登録されていません。右下のボタンから追加できます。
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {items.map((item) => (
        <ActivityListItem
          key={item.id}
          activity={item}
          onSelect={onSelect}
          onToggleStatus={onToggleStatus}
          classNameMap={classNameMap}
        />
      ))}
    </div>
  );
}

function MemoList({
  items,
  loading,
  error,
  onSelect,
  classNameMap,
}: {
  items: Activity[];
  loading: boolean;
  error: string | null;
  onSelect: (activity: Activity) => void;
  classNameMap?: Map<string, string>;
}) {
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
        読み込み中です...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
        メモはまだ登録されていません。右下のボタンから追加できます。
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {items.map((memo) => (
        <ActivityListItem
          key={memo.id}
          activity={memo}
          onSelect={onSelect}
          classNameMap={classNameMap}
        />
      ))}
    </div>
  );
}

type CreateActivityDialogProps = {
  open: boolean;
  type: ActivityType;
  mode: 'create' | 'edit';
  formState: ActivityFormState;
  onChange: (field: keyof ActivityFormState, value: string | boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSaving: boolean;
  error: string | null;
  classOptions: TimetableClassSummary[];
  activeFiscalYear: string | null;
};

function CreateActivityDialog({
  open,
  type,
  mode,
  formState,
  onChange,
  onClose,
  onSubmit,
  isSaving,
  error,
  classOptions,
  activeFiscalYear,
}: CreateActivityDialogProps) {
  if (!open) {
    return null;
  }

  const isAssignment = type === 'assignment';
  const isEditing = mode === 'edit';
  const normalizedFiscalYear =
    typeof activeFiscalYear === 'string' && activeFiscalYear.trim().length > 0
      ? activeFiscalYear.trim()
      : null;
  const trimmedSelection = formState.classId.trim();
  const hasUnknownSelection =
    trimmedSelection.length > 0 &&
    !classOptions.some((option) => option.id === trimmedSelection);
  const placeholderLabel = normalizedFiscalYear
    ? classOptions.length > 0
      ? '関連授業を選択'
      : `${normalizedFiscalYear}年度の授業が見つかりません`
    : '設定で利用中の年度を設定してください';
  const selectionDisabled = normalizedFiscalYear === null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              {isAssignment
                ? isEditing
                  ? '課題を編集'
                  : '課題を追加'
                : isEditing
                  ? 'メモを編集'
                  : 'メモを追加'}
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              {isAssignment
                ? '基本情報とステータスを入力してください。'
                : '基本情報を入力してください。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200"
          >
            <FontAwesomeIcon icon={faXmark} fontSize={18} />
            <span className="sr-only">閉じる</span>
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-neutral-700">タイトル</span>
            <input
              type="text"
              value={formState.title}
              onChange={(event) => onChange('title', event.target.value)}
              placeholder="タイトルを入力"
              className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-neutral-700">詳細</span>
            <textarea
              value={formState.notes}
              onChange={(event) => onChange('notes', event.target.value)}
              rows={4}
              placeholder="詳細を入力"
              className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-neutral-700">関連授業</span>
            <select
              value={formState.classId}
              onChange={(event) => onChange('classId', event.target.value)}
              disabled={selectionDisabled}
              className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-neutral-100"
            >
              <option value="">{placeholderLabel}</option>
              {classOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.className}
                </option>
              ))}
              {hasUnknownSelection ? (
                <option value={trimmedSelection}>{`現在の選択 (${trimmedSelection})`}</option>
              ) : null}
            </select>
            <span className="text-xs text-neutral-500">
              {normalizedFiscalYear
                ? `${normalizedFiscalYear}年度の授業から選択できます。`
                : '設定で利用中の年度を設定すると授業一覧が表示されます。'}
            </span>
          </label>

          {isAssignment ? (
            <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <label className="flex items-center gap-3 text-sm font-medium text-neutral-700">
                <input
                  type="checkbox"
                  checked={formState.isCompleted}
                  onChange={(event) => onChange('isCompleted', event.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-200"
                />
                完了した課題として保存する
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-neutral-700">期限</span>
                <input
                  type="date"
                  value={formState.dueDate}
                  onChange={(event) => onChange('dueDate', event.target.value)}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSaving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSaving ? (isEditing ? '更新中...' : '保存中...') : isEditing ? '更新する' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TodoTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('todo');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<ActivityType>('assignment');
  const [formState, setFormState] = useState<ActivityFormState>(() => createDefaultFormState());
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  const [classOptions, setClassOptions] = useState<TimetableClassSummary[]>([]);

  const { profile, isAuthenticated, initializing: authInitializing } = useAuth();
  const { settings } = useUserSettings();
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
    return map;
  }, [classOptions]);

  const activeFiscalYearForDialog =
    trimmedActiveFiscalYear.length > 0 ? trimmedActiveFiscalYear : null;

  const handleOpenDialog = useCallback(() => {
    const nextType: ActivityType = viewMode === 'todo' ? 'assignment' : 'memo';
    setDialogType(nextType);
    setFormState(createDefaultFormState());
    setDialogError(null);
    setSelectedActivity(null);
    setIsDialogOpen(true);
  }, [viewMode]);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setDialogError(null);
    setIsSaving(false);
    setSelectedActivity(null);
  }, []);

  const handleFormChange = useCallback(
    (field: keyof ActivityFormState, value: string | boolean) => {
      setFormState((prev) => ({
        ...prev,
        [field]: field === 'isCompleted' ? Boolean(value) : (value as string),
      }));
    },
    [],
  );

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

  const handleSelectActivity = useCallback(
    (activity: Activity) => {
      setDialogType(activity.type);
      setFormState(createFormStateFromActivity(activity));
      setDialogError(null);
      setSelectedActivity(activity);
      setIsDialogOpen(true);
    },
    [],
  );

  const handleToggleAssignmentStatus = useCallback(
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

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="flex h-[60px] w-full items-center justify-between border-b border-neutral-200 bg-[var(--color-my-secondary-container)] px-3">
        <h1 className="text-lg font-semibold text-neutral-900">
          {viewMode === 'todo' ? '課題一覧' : 'メモ一覧'}
        </h1>
        <UserHamburgerMenu buttonAriaLabel="ユーザメニューを開く" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[160px] pt-4">
        {authInitializing ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
            認証情報を確認しています...
          </div>
        ) : !isAuthenticated ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
            Todo やメモを利用するにはログインしてください。ユーザタブからサインインできます。
          </div>
        ) : viewMode === 'todo' ? (
          <TodoList
            items={assignments}
            loading={loading}
            error={error}
            onSelect={handleSelectActivity}
            onToggleStatus={handleToggleAssignmentStatus}
            classNameMap={classNameMap}
          />
        ) : (
          <MemoList
            items={memos}
            loading={loading}
            error={error}
            onSelect={handleSelectActivity}
            classNameMap={classNameMap}
          />
        )}
      </div>

      <div className="pointer-events-none fixed bottom-[100px] right-4 z-20 flex items-center gap-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-neutral-200 bg-white/95 px-2.5 py-2 backdrop-blur">
          <ViewToggleButton
            icon={faListCheck}
            label="Todo ビュー"
            isActive={viewMode === 'todo'}
            onClick={() => setViewMode('todo')}
          />
          <ViewToggleButton
            icon={faNoteSticky}
            label="メモ ビュー"
            isActive={viewMode === 'memo'}
            onClick={() => setViewMode('memo')}
          />
        </div>
        <button
          type="button"
          onClick={handleOpenDialog}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white shadow-md transition hover:bg-blue-400"
          aria-label="新規作成"
        >
          <FontAwesomeIcon icon={faPlus} fontSize={20} />
        </button>
      </div>

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
      />
    </div>
  );
}
