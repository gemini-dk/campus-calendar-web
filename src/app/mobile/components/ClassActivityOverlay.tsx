'use client';

import { useEffect } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

import { ClassActivityContent } from '@/app/mobile/classes/[classId]/activity/page';

export type ClassActivityOverlaySession = {
  classId: string;
  className: string;
  periods: (number | 'OD')[];
  detailLabel?: string | null;
};

export type ClassActivityOverlayProps = {
  open: boolean;
  session: ClassActivityOverlaySession | null;
  fiscalYear: string | null;
  onClose: () => void;
};

export default function ClassActivityOverlay({
  open,
  session,
  fiscalYear,
  onClose,
}: ClassActivityOverlayProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !session) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex h-[100svh] w-full flex-1 min-h-0 flex-col bg-white">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-5">
        <h1 className="text-lg font-semibold text-neutral-900">授業活動記録</h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="画面を閉じる"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-100"
        >
          <FontAwesomeIcon icon={faXmark} fontSize={20} />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-100">
        <ClassActivityContent classId={session.classId} fiscalYearOverride={fiscalYear} />
      </div>
    </div>
  );
}
