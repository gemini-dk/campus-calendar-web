'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChalkboardTeacher, faVideo } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

import type { DeliveryType } from '@/app/mobile/types';

type DeliveryToggleGroupProps = {
  value: DeliveryType;
  onChange: (value: DeliveryType) => void;
  disabled?: boolean;
  labels?: Partial<Record<Exclude<DeliveryType, 'unknown'>, string>>;
};

const DELIVERY_OPTIONS: {
  value: Exclude<DeliveryType, 'unknown'>;
  icon: IconDefinition;
  label: string;
  activeClass: string;
  iconClass?: string;
}[] = [
  {
    value: 'in_person',
    icon: faChalkboardTeacher,
    label: '対面',
    activeClass: 'bg-blue-100 text-blue-600',
    iconClass: 'text-[20px]',
  },
  {
    value: 'remote',
    icon: faVideo,
    label: 'オンライン',
    activeClass: 'bg-purple-100 text-purple-600',
    iconClass: 'text-[22px]',
  },
];

export default function DeliveryToggleGroup({
  value,
  onChange,
  disabled,
  labels,
}: DeliveryToggleGroupProps) {
  const options = DELIVERY_OPTIONS.map((option) => ({
    ...option,
    label: labels?.[option.value] ?? option.label,
  }));

  return (
    <div className="flex h-12 w-fit items-center gap-1 rounded-full border border-neutral-200 bg-white px-1.5 shadow-sm">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(isActive ? 'unknown' : option.value)}
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
              className={option.iconClass ?? 'text-[26px]'}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
