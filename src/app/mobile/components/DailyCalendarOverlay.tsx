'use client';

import { useEffect } from 'react';

import DailyCalendarView from './DailyCalendarView';

type DailyCalendarOverlayProps = {
  open: boolean;
  dateId: string | null;
  onClose: () => void;
};

export default function DailyCalendarOverlay({ open, dateId, onClose }: DailyCalendarOverlayProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !dateId) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex h-[100svh] w-full flex-col bg-white">
      <DailyCalendarView dateId={dateId} onClose={onClose} />
    </div>
  );
}
