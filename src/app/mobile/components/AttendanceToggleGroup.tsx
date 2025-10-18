'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faCircleXmark,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

import type { AttendanceStatus } from '@/app/mobile/types';

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
  iconClass?: string;
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
    iconClass: 'text-[26px]',
  },
  {
    value: 'absent',
    icon: faCircleXmark,
    label: '欠席',
    activeClass: 'bg-red-100 text-red-600',
  },
];

export default function AttendanceToggleGroup({
  value,
  onChange,
  disabled,
}: AttendanceToggleGroupProps) {
  return (
    <div className="flex h-11 w-fit items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 shadow-sm">
      {ATTENDANCE_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(isActive ? null : option.value)}
            disabled={disabled}
            aria-pressed={isActive}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
              isActive
                ? option.activeClass
                : 'bg-transparent text-neutral-400 hover:bg-neutral-100'
            } disabled:cursor-not-allowed disabled:opacity-60`}
            aria-label={option.label}
          >
            <FontAwesomeIcon
              icon={option.icon}
              className={option.iconClass ?? 'text-[30px]'}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
