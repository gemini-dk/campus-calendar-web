'use client';

import { useCallback, useState } from 'react';

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListCheck, faNoteSticky, faPlus } from '@fortawesome/free-solid-svg-icons';

import { useAuth } from '@/lib/useAuth';
import UserHamburgerMenu from '../components/UserHamburgerMenu';
import { useActivityDialog } from '../components/ActivityDialogProvider';
import type { Activity, ActivityType } from '../features/activities/types';
import { ActivityListItem } from '../components/ActivityListItem';

type ViewMode = 'todo' | 'memo';

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

      <div className="pointer-events-none fixed inset-x-0 bottom-[5px] pb-safe z-20 flex justify-center px-4">
        <div className="pointer-events-none flex w-full max-w-[800px] items-center justify-end gap-3">
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
    </div>
  );
}

