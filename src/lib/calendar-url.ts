import { getCalendarDomainSuffix } from "./site-url";

function isCampusCalendarDomain(hostname: string | null | undefined): boolean {
  if (!hostname) {
    return false;
  }
  const domainSuffix = getCalendarDomainSuffix();
  return hostname.toLowerCase().endsWith(domainSuffix.toLowerCase());
}

export function getCalendarHref(webId: string): string {
  const normalizedWebId = typeof webId === "string" ? webId.trim() : "";
  if (!normalizedWebId) {
    return "/calendars/";
  }

  if (typeof window !== "undefined") {
    const hostname = window.location?.hostname ?? null;
    if (isCampusCalendarDomain(hostname)) {
      const domainSuffix = getCalendarDomainSuffix();
      return `https://${normalizedWebId}.${domainSuffix}/calendars`;
    }
  }

  return `/calendars/${encodeURIComponent(normalizedWebId)}`;
}
