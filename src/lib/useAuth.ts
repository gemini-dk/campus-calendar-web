'use client';

import {
  getRedirectResult,
  linkWithRedirect,
  onIdTokenChanged,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { auth, db, googleProvider } from '@/lib/firebase/client';

const AUTH_REDIRECT_ERROR_PARAM = 'authRedirectError';
export const AUTH_REDIRECT_ERROR_EVENT = 'campus-calendar:auth-redirect-error';

const AUTH_COOKIE_NAME = 'campus-calendar-auth';
const ONE_HOUR_MS = 60 * 60 * 1000;

type AuthCookiePayload = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  token: string;
  expiresAt: number;
};

export type AuthUserProfile = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
};

type UseAuthState = {
  profile: AuthUserProfile | null;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  initializing: boolean;
  isProcessing: boolean;
  error: string | null;
  successMessage: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useAuth(): UseAuthState {
  const [profile, setProfile] = useState<AuthUserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const cookie = readAuthCookie();
    if (!cookie) {
      return;
    }
    if (cookie.expiresAt <= Date.now()) {
      clearAuthCookie();
      return;
    }
    setProfile(extractProfile(cookie));
  }, []);

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

  useEffect(() => {
    if (!profile?.uid) {
      return;
    }

    const userDocRef = doc(db, 'users', profile.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data() as { nickname?: unknown; iconUrl?: unknown };

        const rawNickname = data.nickname;
        let normalizedNickname: string | null | undefined;
        if (typeof rawNickname === 'string') {
          const trimmed = rawNickname.trim();
          normalizedNickname = trimmed ? trimmed : null;
        } else if (rawNickname === null) {
          normalizedNickname = null;
        }

        const rawIconUrl = data.iconUrl;
        let normalizedIconUrl: string | null | undefined;
        if (typeof rawIconUrl === 'string') {
          const trimmed = rawIconUrl.trim();
          normalizedIconUrl = trimmed ? trimmed : null;
        } else if (rawIconUrl === null) {
          normalizedIconUrl = null;
        }

        setProfile((previous) => {
          if (!previous) {
            return previous;
          }

          const nextDisplayName =
            normalizedNickname !== undefined ? normalizedNickname : previous.displayName;
          const nextPhotoURL =
            normalizedIconUrl !== undefined ? normalizedIconUrl : previous.photoURL;

          if (nextDisplayName === previous.displayName && nextPhotoURL === previous.photoURL) {
            return previous;
          }

          return {
            ...previous,
            displayName: nextDisplayName,
            photoURL: nextPhotoURL,
          } satisfies AuthUserProfile;
        });
      },
      (error) => {
        console.error('Failed to subscribe user profile document', error);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [profile?.uid]);

  useEffect(() => {
    let canceled = false;

    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        clearAuthRedirectErrorParam();
        if (!result) {
          return;
        }

        setIsProcessing(true);

        if (result.operationType === 'link') {
          await result.user.reload();
          const updatedUser = auth.currentUser ?? result.user;
          await updateUserDocumentProfile(updatedUser);
          const cookiePayload = await buildCookiePayload(updatedUser);
          if (!canceled) {
            setAuthCookie(cookiePayload);
            setProfile(extractProfile(cookiePayload));
            const displayName = updatedUser.displayName ?? 'Googleアカウント';
            setSuccessMessage(`${displayName} さんとしてサインインしました。`);
          }
          return;
        }

        await updateUserDocumentProfile(result.user);
        if (!canceled) {
          const displayName = result.user.displayName ?? 'ゲスト';
          setSuccessMessage(`${displayName} さんとしてサインインしました。`);
        }
      } catch (err) {
        if (!canceled) {
          if (err instanceof FirebaseError) {
            setError(err.message);
            setAuthRedirectErrorParam(err.message);
          } else if (err instanceof Error) {
            setError(err.message);
            setAuthRedirectErrorParam(err.message);
          } else {
            const fallbackMessage =
              'リダイレクト後のサインイン処理に失敗しました。時間をおいて再度お試しください。';
            setError(fallbackMessage);
            setAuthRedirectErrorParam(fallbackMessage);
          }
        }
      } finally {
        if (!canceled) {
          setIsProcessing(false);
        }
      }
    };

    void handleRedirectResult();

    return () => {
      canceled = true;
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setSuccessMessage(null);
    setIsProcessing(true);

    try {
      const currentUser = auth.currentUser;

      if (currentUser && currentUser.isAnonymous) {
        await linkWithRedirect(currentUser, googleProvider);
        return;
      }

      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/credential-already-in-use') {
          setError('このGoogleアカウントは既に別のユーザにリンクされています。別のアカウントをご利用ください。');
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
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

  const isAnonymous = profile?.isAnonymous ?? false;
  const isAuthenticated = Boolean(profile);

  return {
    profile,
    isAuthenticated,
    isAnonymous,
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
    isAnonymous: user.isAnonymous,
    token: tokenResult.token,
    expiresAt,
  } satisfies AuthCookiePayload;
}

async function updateUserDocumentProfile(user: User): Promise<void> {
  const providerProfile = user.providerData.find((profile) => profile.providerId === 'google.com')
    ?? user.providerData[0]
    ?? null;

  const nickname = (user.displayName ?? providerProfile?.displayName ?? '').trim();
  const iconUrl = user.photoURL ?? providerProfile?.photoURL ?? '';
  const userDocRef = doc(db, 'users', user.uid);

  const payload: Record<string, string | null> = {
    nickname: nickname || null,
    iconUrl: iconUrl || null,
  };

  await setDoc(userDocRef, payload, { merge: true });
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
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<AuthCookiePayload>;

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    if (typeof parsed.uid !== 'string' || typeof parsed.token !== 'string') {
      return null;
    }

    const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : Date.now();

    return {
      uid: parsed.uid,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
      email: typeof parsed.email === 'string' ? parsed.email : null,
      photoURL: typeof parsed.photoURL === 'string' ? parsed.photoURL : null,
      isAnonymous: Boolean(parsed.isAnonymous),
      token: parsed.token,
      expiresAt,
    } satisfies AuthCookiePayload;
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

function setAuthRedirectErrorParam(message: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(AUTH_REDIRECT_ERROR_PARAM, message);
  window.history.replaceState(window.history.state, '', url);

  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent(AUTH_REDIRECT_ERROR_EVENT, {
        detail: message,
      }),
    );
  }, 0);
}

export function clearAuthRedirectErrorParam() {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has(AUTH_REDIRECT_ERROR_PARAM)) {
    return;
  }

  url.searchParams.delete(AUTH_REDIRECT_ERROR_PARAM);
  window.history.replaceState(window.history.state, '', url);
}

export function consumeAuthRedirectErrorParam(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);
  const message = url.searchParams.get(AUTH_REDIRECT_ERROR_PARAM);
  if (!message) {
    return null;
  }

  url.searchParams.delete(AUTH_REDIRECT_ERROR_PARAM);
  window.history.replaceState(window.history.state, '', url);

  return message;
}

function extractProfile(payload: AuthCookiePayload): AuthUserProfile {
  const { uid, displayName, email, photoURL, isAnonymous } = payload;
  return { uid, displayName, email, photoURL, isAnonymous };
}
