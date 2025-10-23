"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { faCalendar } from "@fortawesome/free-regular-svg-icons";

export type CalendarOverlayIconProps = {
  baseIcon: IconDefinition;
  label: string;
  size?: number;
  verticalOffset?: number;
};

export default function CalendarOverlayIcon({
  baseIcon,
  label,
  size = 20,
  verticalOffset = 4,
}: CalendarOverlayIconProps) {
  const dimension = `${size}px`;
  const baseFontSize = size * 0.4;
  const PT_IN_PX = 4 / 3;
  const labelFontSizeValue = Math.max(0, baseFontSize - PT_IN_PX);
  const labelFontSize = `${labelFontSizeValue}px`;
  const labelTranslateY = `translateY(${verticalOffset + PT_IN_PX}px)`;

  return (
    <span
      aria-hidden="true"
      className="relative inline-flex items-center justify-center text-current"
      style={{ width: dimension, height: dimension }}
    >
      <FontAwesomeIcon icon={baseIcon} style={{ fontSize: size }} />
      <span
        className="pointer-events-none absolute flex items-center justify-center font-bold leading-none text-white group-data-[active=true]:text-blue-500"
        style={{ fontSize: labelFontSize, transform: labelTranslateY }}
      >
        {label}
      </span>
    </span>
  );
}
