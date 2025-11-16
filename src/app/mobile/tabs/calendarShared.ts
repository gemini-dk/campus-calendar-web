"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export const CALENDAR_SETTINGS_ERROR_MESSAGE =
  "学事カレンダー設定が未入力です。設定タブで保存してください。";

import {
  faChalkboardTeacher,
  faCircleQuestion,
  faVideo,
} from "@fortawesome/free-solid-svg-icons";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import {
  mapTimetableClassDate,
  type ClassType,
  type TimetableClassDateDoc,
} from "@/app/mobile/utils/classSchedule";
import type { DeliveryType } from "@/app/mobile/types";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/useAuth";

type CalendarClassSummary = {
  id: string;
  className: string;
  classType: ClassType;
  isFullyOnDemand: boolean;
  termIds: string[];
  termNames: string[];
};

type CalendarDayClassEntry = {
  id: string;
  classId: string;
  className: string;
  classType: ClassType;
  deliveryType: DeliveryType;
  periods: (number | "OD")[];
  isCancelled: boolean;
};

export type ClassEntriesByDateMap = Record<string, CalendarDayClassEntry[]>;

export type SessionIconResult = {
  icon: IconProp;
  className: string;
};

function mapTimetableClassSummary(
  docSnapshot: QueryDocumentSnapshot<DocumentData>,
): CalendarClassSummary | null {
  const data = docSnapshot.data();
  const className = typeof data.className === "string" ? data.className.trim() : "";
  if (!className) {
    return null;
  }

  const rawType = typeof data.classType === "string" ? data.classType.trim() : "";
  const normalizedType: ClassType =
    rawType === "online" || rawType === "hybrid" || rawType === "on_demand"
      ? (rawType as ClassType)
      : "in_person";

  const isFullyOnDemand = data.isFullyOnDemand === true;

  const termIdsRaw = Array.isArray(data.termIds) ? data.termIds : [];
  const termIds = termIdsRaw
    .map((termId) => (typeof termId === "string" ? termId.trim() : ""))
    .filter((termId): termId is string => termId.length > 0);

  const termNamesRaw = Array.isArray(data.termNames) ? data.termNames : [];
  const termNames = termNamesRaw
    .map((termName) => (typeof termName === "string" ? termName.trim() : ""))
    .filter((termName): termName is string => termName.length > 0);

  return {
    id: docSnapshot.id,
    className,
    classType: normalizedType,
    isFullyOnDemand,
    termIds,
    termNames,
  } satisfies CalendarClassSummary;
}

function areClassDateListsEqual(
  prev: TimetableClassDateDoc[] | undefined,
  next: TimetableClassDateDoc[],
): boolean {
  if (!prev) {
    return false;
  }
  if (prev.length !== next.length) {
    return false;
  }
  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index];
    const right = next[index];
    if (
      left.id !== right.id ||
      left.classDate !== right.classDate ||
      left.deliveryType !== right.deliveryType ||
      left.periods.length !== right.periods.length
    ) {
      return false;
    }
    for (let periodIndex = 0; periodIndex < left.periods.length; periodIndex += 1) {
      if (left.periods[periodIndex] !== right.periods[periodIndex]) {
        return false;
      }
    }
  }
  return true;
}

function getPeriodSortKey(periods: (number | "OD")[]): number {
  const numeric = periods.filter((period): period is number => typeof period === "number");
  if (numeric.length > 0) {
    return Math.min(...numeric);
  }
  if (periods.includes("OD")) {
    return 999;
  }
  return 1000;
}

export function resolveSessionIcon(
  classType: ClassType,
  deliveryType: DeliveryType,
): SessionIconResult {
  if (deliveryType === "in_person") {
    return { icon: faChalkboardTeacher, className: "text-neutral-500" };
  }
  if (deliveryType === "remote") {
    return { icon: faVideo, className: "text-neutral-500" };
  }
  if (classType === "online" || classType === "on_demand") {
    return { icon: faVideo, className: "text-neutral-500" };
  }
  if (classType === "in_person") {
    return { icon: faChalkboardTeacher, className: "text-neutral-500" };
  }
  return { icon: faCircleQuestion, className: "text-neutral-500" };
}

export function useCalendarClassEntries(fiscalYear: string) {
  const { profile } = useAuth();
  const userId = profile?.uid ?? null;

  const [classSummaries, setClassSummaries] = useState<Record<string, CalendarClassSummary>>({});
  const [classDatesByClass, setClassDatesByClass] = useState<Record<string, TimetableClassDateDoc[]>>({});
  const classDateUnsubscribeRef = useRef<Record<string, Unsubscribe>>({});

  useEffect(() => {
    const unsubscribeClassDates = () => {
      const entries = Object.entries(classDateUnsubscribeRef.current);
      for (const [, unsubscribe] of entries) {
        try {
          unsubscribe();
        } catch (error) {
          console.error("Failed to unsubscribe class dates listener", error);
        }
      }
      classDateUnsubscribeRef.current = {};
    };

    if (!userId || !fiscalYear) {
      unsubscribeClassDates();
      setClassSummaries({});
      setClassDatesByClass({});
      return () => {};
    }

    const classesRef = collection(
      db,
      "users",
      userId,
      "academic_years",
      fiscalYear,
      "timetable_classes",
    );
    const classesQuery = query(classesRef, orderBy("className"));

    const unsubscribe = onSnapshot(
      classesQuery,
      (snapshot) => {
        const nextSummaries: Record<string, CalendarClassSummary> = {};
        const activeClassIds = new Set<string>();

        snapshot.docs.forEach((docSnapshot) => {
          const summary = mapTimetableClassSummary(docSnapshot);
          if (!summary) {
            return;
          }
          nextSummaries[summary.id] = summary;
          activeClassIds.add(summary.id);

          if (!classDateUnsubscribeRef.current[summary.id]) {
            const classDatesRef = collection(docSnapshot.ref, "class_dates");
            const classDatesQuery = query(classDatesRef, orderBy("classDate"));
            const unsubscribeDates = onSnapshot(
              classDatesQuery,
              (datesSnapshot) => {
                const mapped = datesSnapshot.docs
                  .map((dateSnapshot) => mapTimetableClassDate(dateSnapshot))
                  .filter((item): item is TimetableClassDateDoc => item !== null);
                setClassDatesByClass((prev) => {
                  const prevItems = prev[summary.id];
                  if (areClassDateListsEqual(prevItems, mapped)) {
                    return prev;
                  }
                  return { ...prev, [summary.id]: mapped };
                });
              },
              (error) => {
                console.error("Failed to load class dates", error);
                setClassDatesByClass((prev) => {
                  if (!(summary.id in prev)) {
                    return prev;
                  }
                  const next = { ...prev };
                  delete next[summary.id];
                  return next;
                });
              },
            );
            classDateUnsubscribeRef.current[summary.id] = unsubscribeDates;
          }
        });

        setClassSummaries(nextSummaries);

        setClassDatesByClass((prev) => {
          const next = { ...prev };
          let changed = false;
          Object.keys(next).forEach((classId) => {
            if (!activeClassIds.has(classId)) {
              delete next[classId];
              changed = true;
            }
          });
          return changed ? next : prev;
        });

        Object.keys(classDateUnsubscribeRef.current).forEach((classId) => {
          if (!activeClassIds.has(classId)) {
            try {
              classDateUnsubscribeRef.current[classId]?.();
            } catch (error) {
              console.error("Failed to unsubscribe class dates listener", error);
            }
            delete classDateUnsubscribeRef.current[classId];
          }
        });
      },
      (error) => {
        console.error("Failed to load timetable classes", error);
        setClassSummaries({});
        setClassDatesByClass({});
        unsubscribeClassDates();
      },
    );

    return () => {
      unsubscribe();
      unsubscribeClassDates();
    };
  }, [fiscalYear, userId]);

  const classEntriesByDate = useMemo(() => {
    const next: ClassEntriesByDateMap = {};
    Object.keys(classSummaries).forEach((classId) => {
      const summary = classSummaries[classId];
      const dates = classDatesByClass[classId] ?? [];
      dates.forEach((item) => {
        if (!next[item.classDate]) {
          next[item.classDate] = [];
        }
        next[item.classDate].push({
          id: `${classId}#${item.id}`,
          classId,
          className: summary.className,
          classType: summary.classType,
          deliveryType: item.deliveryType,
          periods: item.periods,
          isCancelled: item.isCancelled,
        });
      });
    });

    Object.keys(next).forEach((dateId) => {
      next[dateId].sort((a, b) => {
        const periodOrder = getPeriodSortKey(a.periods) - getPeriodSortKey(b.periods);
        if (periodOrder !== 0) {
          return periodOrder;
        }
        return a.className.localeCompare(b.className, "ja");
      });
    });

    return next;
  }, [classDatesByClass, classSummaries]);

  return {
    classEntriesByDate,
    classSummaries,
  } as const;
}
