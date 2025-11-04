"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { ActivityFormState, ActivityType } from "@/app/mobile/features/activities/types";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import type { TimetableClassSummary } from "@/lib/data/service/class.service";

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
  selectedClassLabel: string | null;
};

export default function CreateActivityDialog({
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
  selectedClassLabel,
}: CreateActivityDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) {
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
  const unknownSelectionLabel = hasUnknownSelection
    ? selectedClassLabel && selectedClassLabel.trim().length > 0
      ? selectedClassLabel.trim()
      : trimmedSelection
    : null;
  const placeholderLabel = normalizedFiscalYear
    ? classOptions.length > 0
      ? '関連授業を選択'
      : `${normalizedFiscalYear}年度の授業が見つかりません`
    : '設定で利用中の年度を設定してください';
  const selectionDisabled = normalizedFiscalYear === null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
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

          {isAssignment ? (
            <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-700">
              <label className="flex items-center gap-2">
                <span className="font-medium">完了:</span>
                <input
                  type="checkbox"
                  checked={formState.isCompleted}
                  onChange={(event) => onChange('isCompleted', event.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-200"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="font-medium">期限:</span>
                <input
                  type="date"
                  value={formState.dueDate}
                  onChange={(event) => onChange('dueDate', event.target.value)}
                  className="h-9 rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
            </div>
          ) : null}

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
                <option value={trimmedSelection}>
                  {unknownSelectionLabel ?? trimmedSelection}
                </option>
              ) : null}
            </select>
            <span className="text-xs text-neutral-500">
              {normalizedFiscalYear
                ? `${normalizedFiscalYear}年度の授業から選択できます。`
                : '設定で利用中の年度を設定すると授業一覧が表示されます。'}
            </span>
          </label>
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
    </div>,
    document.body,
  );
}
