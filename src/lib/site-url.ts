const DEFAULT_SITE_ORIGIN = "https://www.campus-calendar.jp";

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOrigin(origin: string): string | undefined {
  try {
    return new URL(origin).origin;
  } catch (error) {
    try {
      return new URL(`https://${origin}`).origin;
    } catch (error_) {
      return undefined;
    }
  }
}

export function getSiteOrigin(): string {
  const envOrigin = getEnv("NEXT_PUBLIC_SITE_ORIGIN");
  const normalized = envOrigin ? normalizeOrigin(envOrigin) : undefined;
  return normalized ?? DEFAULT_SITE_ORIGIN;
}

export function buildUniversityCalendarCanonicalUrl(webId: string): string {
  const normalizedWebId = typeof webId === "string" ? webId.trim() : "";
  const origin = getSiteOrigin().replace(/\/$/, "");
  if (!normalizedWebId) {
    return `${origin}/`;
  }
  const encodedWebId = encodeURIComponent(normalizedWebId);
  return `${origin}/${encodedWebId}/calendar/`;
}

export function buildUniversityCalendarYearUrl(webId: string, fiscalYear: string): string {
  const base = buildUniversityCalendarCanonicalUrl(webId).replace(/\/$/, "");
  const normalizedFiscalYear = typeof fiscalYear === "string" ? fiscalYear.trim() : "";
  if (!normalizedFiscalYear) {
    return `${base}/`;
  }
  const encodedFiscalYear = encodeURIComponent(normalizedFiscalYear);
  return `${base}/${encodedFiscalYear}/`;
}
