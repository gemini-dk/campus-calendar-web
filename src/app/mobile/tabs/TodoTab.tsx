'use client';

import { useCallback, useState } from 'react';

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListCheck, faNoteSticky, faPlus } from '@fortawesome/free-solid-svg-icons';
import { faSquare, faSquareCheck } from '@fortawesome/free-regular-svg-icons';

import { useAuth } from '@/lib/useAuth';
import UserHamburgerMenu from '../components/UserHamburgerMenu';
import { useActivityDialog } from '../components/ActivityDialogProvider';
import type {
  Activity,
  ActivityStatus,
  ActivityType,
} from '../features/activities/types';

type ViewMode = 'todo' | 'memo';

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
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function resolveIcon(type: ActivityType, status: ActivityStatus) {
  if (type === 'memo') {
    return { icon: faNoteSticky, className: 'text-neutral-500' };
  }

  if (status === 'done') {
    return { icon: faSquareCheck, className: 'text-neutral-500' };
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
            className="flex h-11 w-11 items-center justify-center text-neutral-500 transition hover:text-neutral-700"
            aria-label={activity.status === 'done' ? '未完了に戻す' : '完了にする'}
          >
            <FontAwesomeIcon icon={icon} fontSize={22} className={className} />
          </button>
        ) : (
          <div className="flex h-11 w-11 items-center justify-center text-neutral-500">
            <FontAwesomeIcon icon={icon} fontSize={22} className={className} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <h3 className="truncate text-base font-normal text-neutral-900">
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
          <span className="whitespace-nowrap text-neutral-400">{createdLabel}</span>
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

export default function TodoTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('todo');
  const { isAuthenticated, initializing: authInitializing } = useAuth();
  const {
    assignments,
    memos,
    loading,
    error,
    classNameMap,
    openCreateDialog,
    openEditDialog,
    toggleAssignmentStatus,
  } = useActivityDialog();

  const handleOpenDialog = useCallback(() => {
    const type: ActivityType = viewMode === 'todo' ? 'assignment' : 'memo';
    openCreateDialog(type);
  }, [openCreateDialog, viewMode]);

  const handleSelectActivity = useCallback(
    (activity: Activity) => {
      openEditDialog(activity);
    },
    [openEditDialog],
  );

  const handleToggleAssignmentStatus = useCallback(
    (activity: Activity) => {
      if (activity.type === 'assignment') {
        void toggleAssignmentStatus(activity);
      }
    },
    [toggleAssignmentStatus],
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
    </div>
  );
}

