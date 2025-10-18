import type { CalendarDay, CalendarTerm } from '../schema/calendar';

export function findTermIndexFromDay(
  day: CalendarDay | null,
  terms: CalendarTerm[],
): number | null {
  if (!day) {
    return null;
  }

  const normalizedTermId = typeof day.termId === 'string' ? day.termId.trim() : '';
  if (normalizedTermId.length > 0) {
    const indexById = terms.findIndex((term) => term.id === normalizedTermId);
    if (indexById >= 0) {
      return indexById;
    }
  }

  const nameCandidates: (string | undefined)[] = [day.termName, day.termShortName];
  for (const candidate of nameCandidates) {
    const normalizedName = typeof candidate === 'string' ? candidate.trim() : '';
    if (!normalizedName) {
      continue;
    }

    const indexByName = terms.findIndex((term) => {
      if (term.name === normalizedName) {
        return true;
      }
      if (term.shortName && term.shortName === normalizedName) {
        return true;
      }
      return false;
    });

    if (indexByName >= 0) {
      return indexByName;
    }
  }

  return null;
}
