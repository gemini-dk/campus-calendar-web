'use client';

import { useCallback, useEffect, useId, useState } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faXmark } from '@fortawesome/free-solid-svg-icons';

import UserMenuContent from './UserMenuContent';

type UserHamburgerMenuProps = {
  buttonAriaLabel?: string;
};

export default function UserHamburgerMenu({ buttonAriaLabel }: UserHamburgerMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        aria-label={buttonAriaLabel ?? 'ユーザメニューを開く'}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-800 shadow-sm transition hover:bg-neutral-100"
      >
        <FontAwesomeIcon icon={faBars} fontSize={20} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex h-[100svh] w-full justify-end">
          <button
            type="button"
            aria-label="メニューを閉じる"
            className="h-full w-full flex-1 bg-black/30"
            onClick={closeMenu}
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            className="flex h-full w-[85%] max-w-[360px] flex-col bg-white shadow-xl"
          >
            <div className="flex h-[50px] w-full items-center justify-between border-b border-neutral-200 px-4">
              <span className="text-base font-semibold text-neutral-900">メニュー</span>
              <button
                type="button"
                aria-label="メニューを閉じる"
                onClick={closeMenu}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-700 transition hover:bg-neutral-100"
              >
                <FontAwesomeIcon icon={faXmark} fontSize={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <UserMenuContent className="h-full overflow-y-auto" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
