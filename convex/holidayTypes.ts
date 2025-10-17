import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export type HolidayEntry = {
  date: string;
  name: string;
};

export type HolidayCacheRecord = {
  _id: Id<"holiday_cache">;
  _creationTime: number;
  fiscalYear: number;
  holidays: HolidayEntry[];
  fetchedAt: number;
};

export const holidayEntryValidator = v.object({
  date: v.string(),
  name: v.string(),
});

export const holidayArrayValidator = v.array(holidayEntryValidator);
