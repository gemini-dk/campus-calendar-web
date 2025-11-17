'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faNoteSticky } from '@fortawesome/free-solid-svg-icons';
import { faSquare, faSquareCheck } from '@fortawesome/free-regular-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

import type { Activity, ActivityStatus, ActivityType } from '../features/activities/types';

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

type IconRenderResult = { icon: IconDefinition; className?: string };

function resolveIcon(type: ActivityType, status: ActivityStatus): IconRenderResult {
  if (type === 'memo') {
    return { icon: faNoteSticky, className: 'text-neutral-500' };
  }

  if (status === 'done') {
    return { icon: faSquareCheck, className: 'text-neutral-500' };
  }

  return { icon: faSquare, className: 'text-neutral-500' };
}

export function ActivityListItem({
  activity,
  onSelect,
  onToggleStatus,
  classNameMap,
  renderIcon,
}: {
  activity: Activity;
  onSelect: (activity: Activity) => void;
  onToggleStatus?: (activity: Activity) => void;
  classNameMap?: Map<string, string>;
  renderIcon?: (activity: Activity) => IconRenderResult | null;
}) {
  const renderedIcon = renderIcon?.(activity);
  const { icon, className } = renderedIcon ?? resolveIcon(activity.type, activity.status);
  const dueLabel = activity.type === 'assignment' ? formatDueDateLabel(activity.dueDate) : null;
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

export type { Activity };
