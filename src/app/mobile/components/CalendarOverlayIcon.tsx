"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

export type CalendarOverlayIconProps = {
  baseIcon: IconDefinition;
  label: string;
  size?: number;
  verticalOffset?: number;
};

export default function CalendarOverlayIcon({
  baseIcon,
  label,
  size = 24,
  verticalOffset = 0,
}: CalendarOverlayIconProps) {
  const dimension = `${size}px`;
  const fontSize = size * 0.45;

  return (
    <span
      aria-hidden="true"
      className="relative inline-flex items-center justify-center text-current"
      style={{ width: dimension, height: dimension }}
    >
      <FontAwesomeIcon icon={baseIcon} style={{ fontSize: size }} />
      <span
        className="pointer-events-none absolute flex items-center justify-center font-bold leading-none text-current"
        style={{ fontSize, transform: `translateY(${verticalOffset}px)` }}
      >
        {label}
      </span>
    </span>
  );
}
