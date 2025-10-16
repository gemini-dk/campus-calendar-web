'use client';

import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const displayName = result.user.displayName ?? 'ゲスト';
      setSuccessMessage(`${displayName} さんとしてサインインしました。`);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        return;
      }
      setError('予期せぬエラーが発生しました。しばらく待ってから再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black px-6 py-12 text-slate-50">
      <main className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl shadow-slate-900/60 backdrop-blur">
        <h1 className="text-center text-3xl font-bold tracking-tight text-white">
          Campus Calendar
        </h1>
        <p className="mt-3 text-center text-sm text-slate-300">
          Google アカウントでサインインして、大学生活の予定をひとまとめに管理しましょう。
        </p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="mt-8 inline-flex w-full items-center justify-center rounded-full border border-white/20 bg-white text-base font-semibold text-slate-900 transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-75"
        >
          <span className="flex h-12 items-center justify-center gap-3">
            <GoogleIcon />
            {isLoading ? 'サインイン処理中…' : 'Google でサインイン'}
          </span>
        </button>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </p>
        ) : null}

        <p className="mt-8 text-center text-xs text-slate-400">
          サインインすることで利用規約とプライバシーポリシーに同意したものとみなされます。
        </p>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.35 11.1H12v2.92h5.35c-.23 1.23-.93 2.27-1.98 2.96v2.45h3.2c1.87-1.72 2.95-4.25 2.95-7.24 0-.7-.06-1.38-.17-2.03Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.62-2.45l-3.2-2.45c-.9.6-2.05.96-3.42.96a5.94 5.94 0 0 1-5.64-4.12H3.04v2.54A9.99 9.99 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.36 13.94A5.97 5.97 0 0 1 6.04 12c0-.68.12-1.34.32-1.94V7.52H3.04A10 10 0 0 0 2 12c0 1.6.38 3.12 1.04 4.48l3.32-2.54Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.06c1.47 0 2.8.5 3.84 1.48l2.88-2.88C16.96 2.9 14.7 2 12 2 8.13 2 4.79 4.24 3.04 7.52l3.32 2.54A5.95 5.95 0 0 1 12 6.06Z"
        fill="#EA4335"
      />
    </svg>
  );
}
