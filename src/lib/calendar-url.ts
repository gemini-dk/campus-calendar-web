export function getCalendarHref(webId: string): string {
  const normalizedWebId = typeof webId === "string" ? webId.trim() : "";
  if (!normalizedWebId) {
    return "/";
  }
  const encodedWebId = encodeURIComponent(normalizedWebId);
  return `/${encodedWebId}/calendar/`;
}
