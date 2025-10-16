export const LOCALE_COOKIE_NAME = 'cc_locale';
export const LOCALE_HEADER_NAME = 'x-cc-locale';

export const SUPPORTED_SYSTEM_LOCALES = ['ja', 'en'] as const;
export type SupportedSystemLocale = (typeof SUPPORTED_SYSTEM_LOCALES)[number];

export const SYSTEM_DEFAULT_LOCALE: SupportedSystemLocale = 'ja';

export function isSupportedSystemLocale(locale: string): locale is SupportedSystemLocale {
  return SUPPORTED_SYSTEM_LOCALES.includes(locale as SupportedSystemLocale);
}

export function normalizeLocale(locale?: string | null): SupportedSystemLocale {
  if (!locale) {
    return SYSTEM_DEFAULT_LOCALE;
  }

  const normalized = locale.trim().toLowerCase().split('-')[0];

  return isSupportedSystemLocale(normalized) ? normalized : SYSTEM_DEFAULT_LOCALE;
}
