import {
  getUniversityByWebId as getUniversityByWebIdRepository,
  listUniversities as listUniversitiesRepository,
  listUniversityCalendars as listUniversityCalendarsRepository,
  updateUniversityColors as updateUniversityColorsRepository,
  type UniversityColorUpdate,
} from '../repository/university.repository';

export const listUniversities = listUniversitiesRepository;
export const getUniversityByWebId = getUniversityByWebIdRepository;
export const listUniversityCalendars = listUniversityCalendarsRepository;
export const updateUniversityColors = updateUniversityColorsRepository;

export type { UniversityColorUpdate };
