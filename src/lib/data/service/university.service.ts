import {
  getUniversityByWebId as getUniversityByWebIdRepository,
  listPublishableCalendarsByFiscalYear as listPublishableCalendarsByFiscalYearRepository,
  listUniversities as listUniversitiesRepository,
  listUniversityCalendars as listUniversityCalendarsRepository,
} from '../repository/university.repository';

export const listUniversities = listUniversitiesRepository;
export const getUniversityByWebId = getUniversityByWebIdRepository;
export const listUniversityCalendars = listUniversityCalendarsRepository;
export const listPublishableCalendarsByFiscalYear =
  listPublishableCalendarsByFiscalYearRepository;
