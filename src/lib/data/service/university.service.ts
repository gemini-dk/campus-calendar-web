import {
  getUniversityByWebId as getUniversityByWebIdRepository,
  listUniversities as listUniversitiesRepository,
  listUniversityCalendars as listUniversityCalendarsRepository,
} from '../repository/university.repository';

export const listUniversities = listUniversitiesRepository;
export const getUniversityByWebId = getUniversityByWebIdRepository;
export const listUniversityCalendars = listUniversityCalendarsRepository;
