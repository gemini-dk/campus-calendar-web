'use client';

import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ToastVariant = 'info' | 'success' | 'error';

export type ToastOptions = {
  message: string;
  tone?: ToastVariant;
  durationMs?: number;
};

type ToastRecord = Required<ToastOptions> & { id: number };

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
};

const DEFAULT_DURATION = 6000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, tone = 'info', durationMs = DEFAULT_DURATION }: ToastOptions) => {
      if (!message) {
        return;
      }

      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, tone, durationMs }]);

      window.setTimeout(() => {
        removeToast(id);
      }, durationMs);
    },
    [removeToast],
  );

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  const getToneClassName = useCallback((tone: ToastVariant) => {
    switch (tone) {
      case 'success':
        return 'border-green-200 bg-green-50 text-green-900';
      case 'error':
        return 'border-red-200 bg-red-50 text-red-900';
      default:
        return 'border-neutral-200 bg-white text-neutral-900';
    }
  }, []);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex min-w-64 max-w-md items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${getToneClassName(toast.tone)}`}
            role="status"
            aria-live="polite"
          >
            <span className="flex-1 text-sm leading-relaxed">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-sm font-semibold text-current opacity-70 transition hover:opacity-100"
            >
              閉じる
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
