'use client';

import { useAuth } from '@/lib/useAuth';

export default function UserTab() {
  const {
    profile,
    isAuthenticated,
    initializing,
    isProcessing,
    error,
    successMessage,
    signInWithGoogle,
    signOut,
  } = useAuth();

  if (initializing) {
    return (
      <div className="flex min-h-full items-center justify-center p-4 text-sm text-neutral-600">
        読み込み中...
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4 text-neutral-800">
        <div className="flex flex-col items-center gap-4">
          <p className="text-base font-medium">{profile?.displayName ?? 'ユーザ'} さんでログイン中</p>
          <button
            type="button"
            onClick={signOut}
            disabled={isProcessing}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
          >
            {isProcessing ? '処理中...' : 'ログアウト'}
          </button>
          {(error || successMessage) && (
            <div className="text-center text-xs">
              {error ? <p className="text-red-600">{error}</p> : <p className="text-green-600">{successMessage}</p>}
            </div>
          )}
        </div>
        <div className="mt-auto w-full max-w-xs border-t border-neutral-200 pt-3 text-xs text-neutral-500">
          <p className="mb-2 text-center font-medium text-neutral-700">開発用メニュー</p>
          <div className="flex flex-col items-center gap-1 text-blue-600">
            <a className="hover:underline" href="/calendar-debug">
              calendar-debug
            </a>
            <a className="hover:underline" href="/timetable_debug">
              timetable_debug
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4 text-neutral-800">
      <div className="flex flex-col items-center gap-4">
        <p className="text-base">ログインして機能を利用しましょう。</p>
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={isProcessing}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isProcessing ? '処理中...' : 'Googleでログイン'}
        </button>
        {(error || successMessage) && (
          <div className="text-center text-xs">
            {error ? <p className="text-red-600">{error}</p> : <p className="text-green-600">{successMessage}</p>}
          </div>
        )}
      </div>
      <div className="mt-auto w-full max-w-xs border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        <p className="mb-2 text-center font-medium text-neutral-700">開発用メニュー</p>
        <div className="flex flex-col items-center gap-1 text-blue-600">
          <a className="hover:underline" href="/calendar-debug">
            calendar-debug
          </a>
          <a className="hover:underline" href="/timetable_debug">
            timetable_debug
          </a>
        </div>
      </div>
    </div>
  );
}
