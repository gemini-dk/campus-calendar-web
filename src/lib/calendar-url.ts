const CAMPUS_CALENDAR_DOMAIN_SUFFIX = 'campus-calendar.jp';

function isCampusCalendarDomain(hostname: string | null | undefined): boolean {
  if (!hostname) {
    return false;
  }
  return hostname.toLowerCase().endsWith(CAMPUS_CALENDAR_DOMAIN_SUFFIX);
}

export function getCalendarHref(webId: string): string {
  const normalizedWebId = typeof webId === 'string' ? webId.trim() : '';
  if (!normalizedWebId) {
    return '/calendars/';
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location?.hostname ?? null;
    if (isCampusCalendarDomain(hostname)) {
      return `https://${normalizedWebId}.${CAMPUS_CALENDAR_DOMAIN_SUFFIX}/calendar`;
    }
  }

  return `/calendars/${encodeURIComponent(normalizedWebId)}`;
}
