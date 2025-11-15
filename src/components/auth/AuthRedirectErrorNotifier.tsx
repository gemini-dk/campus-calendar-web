'use client';

import { useEffect } from 'react';

import { useToast } from '@/components/ui/ToastProvider';
import { AUTH_REDIRECT_ERROR_EVENT, consumeAuthRedirectErrorParam } from '@/lib/useAuth';

export function AuthRedirectErrorNotifier() {
  const { showToast } = useToast();

  useEffect(() => {
    const notifyRedirectError = () => {
      const message = consumeAuthRedirectErrorParam();
      if (!message) {
        return;
      }

      showToast({
        tone: 'error',
        message: `${message} 既に他のアカウントと連携済のため、連携できません。このアカウントをご利用になるには一度ログアウトしてからログインし直してください。`,
      });
    };

    notifyRedirectError();

    if (typeof window === 'undefined') {
      return;
    }

    const handleRedirectError: EventListener = () => {
      notifyRedirectError();
    };

    window.addEventListener(AUTH_REDIRECT_ERROR_EVENT, handleRedirectError);

    return () => {
      window.removeEventListener(AUTH_REDIRECT_ERROR_EVENT, handleRedirectError);
    };
  }, [showToast]);

  return null;
}
