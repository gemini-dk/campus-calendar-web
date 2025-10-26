const DEFAULT_SITE_ORIGIN = "https://www.campus-calendar.jp";
const DEFAULT_CALENDAR_DOMAIN_SUFFIX = "campus-calendar.jp";

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

function normalizeDomainSuffix(domain: string): string | undefined {
  const cleaned = domain.replace(/^\.+/, "").replace(/\.$/, "").trim();
  if (!cleaned) {
    return undefined;
  }
  return cleaned.toLowerCase();
}

export function getSiteOrigin(): string {
  const envOrigin = getEnv("NEXT_PUBLIC_SITE_ORIGIN");
  const normalized = envOrigin ? normalizeOrigin(envOrigin) : undefined;
  return normalized ?? DEFAULT_SITE_ORIGIN;
}

export function getCalendarDomainSuffix(): string {
  const envDomain = getEnv("NEXT_PUBLIC_CALENDAR_DOMAIN_SUFFIX");
  const normalized = envDomain ? normalizeDomainSuffix(envDomain) : undefined;
  return normalized ?? DEFAULT_CALENDAR_DOMAIN_SUFFIX;
}

export function buildUniversityCalendarCanonicalUrl(webId: string): string {
  const normalizedWebId = typeof webId === "string" ? webId.trim() : "";
  const domainSuffix = getCalendarDomainSuffix();
  if (!normalizedWebId) {
    return `${getSiteOrigin().replace(/\/$/, "")}/calendars`;
  }
  return `https://${normalizedWebId}.${domainSuffix}/calendars`;
}
