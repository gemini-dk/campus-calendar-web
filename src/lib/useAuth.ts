'use client';

import {
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { auth, googleProvider } from '@/lib/firebase/client';

const AUTH_COOKIE_NAME = 'campus-calendar-auth';
const ONE_HOUR_MS = 60 * 60 * 1000;

type AuthCookiePayload = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  token: string;
  expiresAt: number;
};

export type AuthUserProfile = Omit<AuthCookiePayload, 'token' | 'expiresAt'>;

type UseAuthState = {
  profile: AuthUserProfile | null;
  isAuthenticated: boolean;
  initializing: boolean;
  isProcessing: boolean;
  error: string | null;
  successMessage: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useAuth(): UseAuthState {
  const initialProfile = useMemo(() => {
    const cookie = readAuthCookie();
    if (!cookie) {
      return null;
    }
    if (cookie.expiresAt <= Date.now()) {
      clearAuthCookie();
      return null;
    }
    return extractProfile(cookie);
  }, []);

  const [profile, setProfile] = useState<AuthUserProfile | null>(initialProfile);
  const [initializing, setInitializing] = useState(!initialProfile);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        clearAuthCookie();
        setProfile(null);
        setInitializing(false);
        return;
      }

      const cookiePayload = await buildCookiePayload(user);
      setAuthCookie(cookiePayload);
      setProfile(extractProfile(cookiePayload));
      setInitializing(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setSuccessMessage(null);
    setIsProcessing(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const displayName = result.user.displayName ?? 'ゲスト';
      setSuccessMessage(`${displayName} さんとしてサインインしました。`);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('予期せぬエラーが発生しました。しばらく待ってから再度お試しください。');
      }
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setError(null);
    setSuccessMessage(null);
    setIsProcessing(true);

    try {
      await signOut(auth);
      clearAuthCookie();
      setProfile(null);
      setSuccessMessage('サインアウトしました。');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('サインアウトに失敗しました。時間をおいて再度お試しください。');
      }
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    profile,
    isAuthenticated: Boolean(profile),
    initializing,
    isProcessing,
    error,
    successMessage,
    signInWithGoogle,
    signOut: signOutUser,
  };
}

async function buildCookiePayload(user: User): Promise<AuthCookiePayload> {
  const tokenResult = await user.getIdTokenResult();
  const expiresAt = Number.isNaN(Date.parse(tokenResult.expirationTime))
    ? Date.now() + ONE_HOUR_MS
    : Date.parse(tokenResult.expirationTime);

  return {
    uid: user.uid,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    token: tokenResult.token,
    expiresAt,
  } satisfies AuthCookiePayload;
}

function setAuthCookie(payload: AuthCookiePayload) {
  if (typeof document === 'undefined') {
    return;
  }

  const expires = new Date(payload.expiresAt).toUTCString();
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}; path=/; expires=${expires}; SameSite=Lax`;
}

function readAuthCookie(): AuthCookiePayload | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie.split('; ').filter(Boolean);
  const target = cookies.find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!target) {
    return null;
  }

  const value = target.substring(target.indexOf('=') + 1);

  try {
    return JSON.parse(decodeURIComponent(value)) as AuthCookiePayload;
  } catch (err) {
    console.error('Failed to parse auth cookie', err);
    return null;
  }
}

function clearAuthCookie() {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

function extractProfile(payload: AuthCookiePayload): AuthUserProfile {
  const { uid, displayName, email, photoURL } = payload;
  return { uid, displayName, email, photoURL };
}
