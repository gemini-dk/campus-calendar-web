"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { getCalendarDay } from "@/lib/data/repository/calendar.repository";
import ClassActivityOverlay, {
  type ClassActivityOverlaySession,
} from "@/app/mobile/components/ClassActivityOverlay";
import type { CalendarDay, CalendarTerm } from "@/lib/data/schema/calendar";
import { getCalendarTerms } from "@/lib/data/service/calendar.service";
import type { SpecialScheduleOption } from "@/lib/data/service/class.service";
import { SPECIAL_SCHEDULE_OPTION_LABELS } from "@/lib/data/service/class.service";
import { formatPeriodLabel } from "@/app/mobile/utils/classSchedule";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/useAuth";

type CalendarEntry = {
  fiscalYear: string;
  calendarId: string;
  lessonsPerDay: number;
  hasSaturdayClasses: boolean;
};

type ClassScheduleViewProps = {
  calendar: CalendarEntry | null;
};

type LoadState = "idle" | "loading" | "success" | "error";

type PagerItem = {
  id: string;
  name: string;
  isPlaceholder?: boolean;
};

type TimetableClassDoc = {
  id: string;
  className: string;
  termIds: string[];
  termNames: string[];
  location: string | null;
  specialScheduleOption: SpecialScheduleOption;
  isFullyOnDemand: boolean;
};

type WeeklySlotDoc = {
  id: string;
  dayOfWeek: number;
  periodKey: string;
};

type ScheduleCellItem = {
  classId: string;
  className: string;
  location: string | null;
  specialScheduleOption: SpecialScheduleOption;
};

const WEEKDAY_HEADERS = [
  { key: 1, label: "月" },
  { key: 2, label: "火" },
  { key: 3, label: "水" },
  { key: 4, label: "木" },
  { key: 5, label: "金" },
  { key: 6, label: "土" },
];

const PERIOD_COLUMN_WIDTH = "2ch";

const DRAG_DETECTION_THRESHOLD = 6;
const SWIPE_TRIGGER_RATIO = 0.25;

function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findTermIndexFromDay(
  day: CalendarDay | null,
  termIndexById: Map<string, number>,
  termIndexByName: Map<string, number>,
): number | null {
  if (!day) {
    return null;
  }

  const termId = typeof day.termId === "string" ? day.termId.trim() : "";
  if (termId && termIndexById.has(termId)) {
    return termIndexById.get(termId) ?? null;
  }

  const nameCandidates: (string | undefined)[] = [day.termName, day.termShortName];
  for (const candidate of nameCandidates) {
    const normalized = typeof candidate === "string" ? candidate.trim() : "";
    if (!normalized) {
      continue;
    }
    if (termIndexByName.has(normalized)) {
      return termIndexByName.get(normalized) ?? null;
    }
  }

  return null;
}

async function resolveInitialTermIndex(
  terms: CalendarTerm[],
  fiscalYear: string,
  calendarId: string,
): Promise<number> {
  if (terms.length === 0) {
    return 0;
  }

  const trimmedFiscalYear = fiscalYear.trim();
  const trimmedCalendarId = calendarId.trim();
  if (!trimmedFiscalYear || !trimmedCalendarId) {
    return 0;
  }

  const fiscalYearNumber = Number.parseInt(trimmedFiscalYear, 10);
  if (!Number.isFinite(fiscalYearNumber)) {
    return 0;
  }

  const termIndexById = new Map<string, number>();
  const termIndexByName = new Map<string, number>();
  terms.forEach((term, index) => {
    termIndexById.set(term.id, index);
    termIndexByName.set(term.name, index);
    if (term.shortName) {
      termIndexByName.set(term.shortName, index);
    }
  });

  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const deadline = new Date(fiscalYearNumber + 1, 2, 31);

  for (
    let current = new Date(startDate);
    current.getTime() <= deadline.getTime();
    current.setDate(current.getDate() + 1)
  ) {
    const dateId = formatDateId(current);
    const day = await getCalendarDay(trimmedFiscalYear, trimmedCalendarId, dateId);
    const termIndex = findTermIndexFromDay(day, termIndexById, termIndexByName);
    if (termIndex !== null) {
      return termIndex;
    }
  }

  return Math.max(terms.length - 1, 0);
}

function mapTimetableClassDoc(
  doc: QueryDocumentSnapshot<DocumentData>,
): TimetableClassDoc | null {
  const data = doc.data();
  const className = typeof data.className === "string" ? data.className.trim() : "";
  if (!className) {
    return null;
  }

  const location =
    typeof data.location === "string" && data.location.trim().length > 0
      ? data.location.trim()
      : null;

  const termIds = Array.isArray(data.termIds)
    ? data.termIds
        .map((termId) => (typeof termId === "string" ? termId.trim() : ""))
        .filter((termId) => termId.length > 0)
    : [];

  const termNames = Array.isArray(data.termNames)
    ? data.termNames
        .map((term) => (typeof term === "string" ? term.trim() : ""))
        .filter((term) => term.length > 0)
    : [];

  const specialValue =
    typeof data.specialScheduleOption === "string" ? data.specialScheduleOption : "all";
  const specialScheduleOption: SpecialScheduleOption =
    specialValue in SPECIAL_SCHEDULE_OPTION_LABELS
      ? (specialValue as SpecialScheduleOption)
      : "all";

  const isFullyOnDemand = Boolean(data.isFullyOnDemand);

  return {
    id: doc.id,
    className,
    termIds,
    termNames,
    location,
    specialScheduleOption,
    isFullyOnDemand,
  } satisfies TimetableClassDoc;
}

function mapWeeklySlotDoc(doc: QueryDocumentSnapshot<DocumentData>): WeeklySlotDoc | null {
  const data = doc.data();
  const dayOfWeek =
    typeof data.dayOfWeek === "number" && Number.isFinite(data.dayOfWeek)
      ? Math.trunc(data.dayOfWeek)
      : null;
  if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 7) {
    return null;
  }

  const periodRaw =
    typeof data.period === "number" && Number.isFinite(data.period)
      ? Math.trunc(data.period)
      : null;
  if (periodRaw === null) {
    return null;
  }

  const periodKey = periodRaw <= 0 ? "OD" : String(periodRaw);

  return {
    id: doc.id,
    dayOfWeek,
    periodKey,
  } satisfies WeeklySlotDoc;
}

export default function ClassScheduleView({ calendar }: ClassScheduleViewProps) {
  const { profile } = useAuth();
  const userId = profile?.uid ?? null;

  const [terms, setTerms] = useState<CalendarTerm[]>([]);
  const [termLoadState, setTermLoadState] = useState<LoadState>("idle");
  const [termError, setTermError] = useState<string | null>(null);
  const [activeTermIndex, setActiveTermIndex] = useState(0);

  const [classes, setClasses] = useState<TimetableClassDoc[]>([]);
  const [classLoadState, setClassLoadState] = useState<LoadState>("idle");
  const [classError, setClassError] = useState<string | null>(null);
  const [weeklySlotRecords, setWeeklySlotRecords] = useState<Record<string, WeeklySlotDoc[]>>({});
  const [initializedWeeklySlots, setInitializedWeeklySlots] = useState<Record<string, true>>({});

  const [viewportWidth, setViewportWidth] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const [selectedActivity, setSelectedActivity] = useState<ClassActivityOverlaySession | null>(
    null,
  );

  const handleOpenClassActivity = useCallback((session: ClassActivityOverlaySession) => {
    setSelectedActivity(session);
  }, []);

  const handleCloseClassActivity = useCallback(() => {
    setSelectedActivity(null);
  }, []);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const isPointerDownRef = useRef(false);
  const dragStartRef = useRef(0);
  const baseOffsetRef = useRef(0);
  const dragDeltaRef = useRef(0);
  const isDraggingRef = useRef(false);

  const pagerItems = useMemo<PagerItem[]>(() => {
    if (terms.length === 0) {
      return [{ id: "__placeholder__", name: "学期未設定", isPlaceholder: true }];
    }
    return terms.map((term) => ({ id: term.id, name: term.name }));
  }, [terms]);

  const clampedTermIndex = useMemo(() => {
    if (pagerItems.length === 0) {
      return 0;
    }
    return Math.min(activeTermIndex, pagerItems.length - 1);
  }, [activeTermIndex, pagerItems.length]);

  useEffect(() => {
    setActiveTermIndex((prev) => {
      if (pagerItems.length === 0) {
        return 0;
      }
      return Math.min(prev, pagerItems.length - 1);
    });
  }, [pagerItems.length]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setViewportWidth(entry.contentRect.width);
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }
    if (viewportWidth <= 0) {
      return;
    }
    const offset = -clampedTermIndex * viewportWidth;
    baseOffsetRef.current = offset;
    setTranslateX(offset);
  }, [clampedTermIndex, viewportWidth]);

  useEffect(() => {
    if (!calendar) {
      setTerms([]);
      setTermLoadState("error");
      setTermError("学事カレンダー設定が見つかりません。設定タブから登録してください。");
      setActiveTermIndex(0);
      setTranslateX(0);
      baseOffsetRef.current = 0;
      setIsAnimating(false);
      return;
    }

    let active = true;

    const loadTerms = async () => {
      try {
        setTermLoadState("loading");
        setTermError(null);
        const items = await getCalendarTerms(calendar.fiscalYear, calendar.calendarId);
        if (!active) {
          return;
        }
        const filtered = items.filter((term) => term.holidayFlag === 2);
        let initialIndex = 0;
        if (filtered.length > 0) {
          initialIndex = await resolveInitialTermIndex(
            filtered,
            calendar.fiscalYear,
            calendar.calendarId,
          );
          if (!active) {
            return;
          }
        }
        setTerms(filtered);
        setActiveTermIndex(initialIndex);
        setTranslateX(0);
        baseOffsetRef.current = 0;
        setIsAnimating(false);
        setTermLoadState("success");
      } catch (error) {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "学期情報の取得に失敗しました。";
        setTerms([]);
        setActiveTermIndex(0);
        setTranslateX(0);
        baseOffsetRef.current = 0;
        setIsAnimating(false);
        setTermError(message);
        setTermLoadState("error");
      }
    };

    void loadTerms();

    return () => {
      active = false;
    };
  }, [calendar]);

  useEffect(() => {
    if (!userId || !calendar) {
      setClasses([]);
      setClassLoadState("idle");
      setClassError(null);
      return;
    }

    const { fiscalYear, calendarId } = calendar;
    if (!fiscalYear || !calendarId) {
      setClasses([]);
      setClassLoadState("idle");
      setClassError(null);
      return;
    }

    setClassLoadState("loading");
    setClassError(null);

    const classesCollection = collection(
      db,
      "users",
      userId,
      "academic_years",
      fiscalYear,
      "timetable_classes",
    );

    const classesQuery = query(
      classesCollection,
      where("calendarId", "==", calendarId),
      orderBy("className", "asc"),
    );

    const unsubscribe = onSnapshot(
      classesQuery,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((docSnapshot) => mapTimetableClassDoc(docSnapshot))
          .filter((item): item is TimetableClassDoc => item !== null);
        setClasses(mapped);
        setClassLoadState("success");
        setClassError(null);
      },
      (error) => {
        console.error("Failed to load timetable classes", error);
        setClasses([]);
        setClassLoadState("error");
        setClassError("授業情報の取得に失敗しました。");
      },
    );

    return () => {
      unsubscribe();
    };
  }, [calendar, userId]);

  useEffect(() => {
    if (!userId || !calendar) {
      setWeeklySlotRecords({});
      setInitializedWeeklySlots({});
      return;
    }

    const { fiscalYear } = calendar;
    if (!fiscalYear || classes.length === 0) {
      setWeeklySlotRecords({});
      setInitializedWeeklySlots({});
      return;
    }

    const activeClassIds = new Set(classes.map((item) => item.id));
    setWeeklySlotRecords((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (!activeClassIds.has(key)) {
          delete next[key];
        }
      }
      return next;
    });
    setInitializedWeeklySlots((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (!activeClassIds.has(key)) {
          delete next[key];
        }
      }
      return next;
    });

    const unsubscribers: Unsubscribe[] = [];

    for (const classItem of classes) {
      const slotsCollection = collection(
        db,
        "users",
        userId,
        "academic_years",
        fiscalYear,
        "timetable_classes",
        classItem.id,
        "weekly_slots",
      );

      const unsubscribe = onSnapshot(
        slotsCollection,
        (snapshot) => {
          const mapped = snapshot.docs
            .map((docSnapshot) => mapWeeklySlotDoc(docSnapshot))
            .filter((item): item is WeeklySlotDoc => item !== null)
            .sort((a, b) => {
              if (a.dayOfWeek !== b.dayOfWeek) {
                return a.dayOfWeek - b.dayOfWeek;
              }
              return a.periodKey.localeCompare(b.periodKey, "ja");
            });
          setWeeklySlotRecords((prev) => ({ ...prev, [classItem.id]: mapped }));
          setInitializedWeeklySlots((prev) => ({ ...prev, [classItem.id]: true }));
        },
        (error) => {
          console.error("Failed to load weekly slots", error);
          setWeeklySlotRecords((prev) => {
            const next = { ...prev };
            delete next[classItem.id];
            return next;
          });
          setInitializedWeeklySlots((prev) => ({ ...prev, [classItem.id]: true }));
        },
      );

      unsubscribers.push(unsubscribe);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
    };
  }, [calendar, classes, userId]);

  const weekdayHeaders = useMemo(() => {
    if (calendar?.hasSaturdayClasses) {
      return WEEKDAY_HEADERS.slice(0, 6);
    }
    return WEEKDAY_HEADERS.slice(0, 5);
  }, [calendar?.hasSaturdayClasses]);

  const fullOnDemandByTerm = useMemo(() => {
    const result = new Map<string, ScheduleCellItem[]>();
    if (terms.length === 0 || classes.length === 0) {
      return result;
    }

    const termNameToId = new Map<string, string>();
    const orderedTermIds = terms.map((term) => {
      termNameToId.set(term.name, term.id);
      return term.id;
    });
    const termIdSet = new Set(orderedTermIds);

    for (const classItem of classes) {
      if (!classItem.isFullyOnDemand) {
        continue;
      }

      const normalizedTermIds = classItem.termIds.filter((termId) => termIdSet.has(termId));
      const fallbackTermIds = classItem.termNames
        .map((name) => termNameToId.get(name))
        .filter((termId): termId is string => typeof termId === "string" && termIdSet.has(termId));
      const uniqueTermIds = Array.from(new Set([...normalizedTermIds, ...fallbackTermIds]));
      const targetTermIds = uniqueTermIds.length > 0 ? uniqueTermIds : orderedTermIds;

      for (const termId of targetTermIds) {
        const current = result.get(termId) ?? [];
        current.push({
          classId: classItem.id,
          className: classItem.className,
          location: classItem.location,
          specialScheduleOption: classItem.specialScheduleOption,
        });
        result.set(termId, current);
      }
    }

    for (const [termId, list] of result) {
      result.set(
        termId,
        list
          .slice()
          .sort((a, b) => a.className.localeCompare(b.className, "ja")),
      );
    }

    return result;
  }, [classes, terms]);

  const hasFullOnDemandEntries = useMemo(
    () => Array.from(fullOnDemandByTerm.values()).some((entries) => entries.length > 0),
    [fullOnDemandByTerm],
  );

  const shouldDisplayFullOnDemandRow = useMemo(
    () => hasFullOnDemandEntries || classes.some((item) => item.isFullyOnDemand),
    [classes, hasFullOnDemandEntries],
  );

  const periodLabels = useMemo(() => {
    const lessons = Math.max(0, calendar?.lessonsPerDay ?? 0);
    const numbers = Array.from({ length: lessons }, (_, index) => String(index + 1));
    const labels = [...numbers, "OD"];
    if (shouldDisplayFullOnDemandRow) {
      labels.push("FOD");
    }
    return labels;
  }, [calendar?.lessonsPerDay, shouldDisplayFullOnDemandRow]);

  const columnTemplate = useMemo(() => {
    const weekdayCount = Math.max(weekdayHeaders.length, 1);
    return `${PERIOD_COLUMN_WIDTH} repeat(${weekdayCount}, minmax(0, 1fr))`;
  }, [weekdayHeaders.length]);

  const rowTemplate = useMemo(() => {
    if (periodLabels.length === 0) {
      return undefined;
    }
    return `repeat(${periodLabels.length}, minmax(0, 1fr))`;
  }, [periodLabels.length]);

  const enableSwipe = pagerItems.length > 1;

  const scheduleByTerm = useMemo(() => {
    const result = new Map<string, Map<string, ScheduleCellItem[]>>();
    if (terms.length === 0 || classes.length === 0) {
      return result;
    }

    const allowedWeekdays = new Set(weekdayHeaders.map((weekday) => weekday.key));
    const availablePeriodKeys = new Set(periodLabels.filter((label) => label !== "FOD"));
    const termNameToId = new Map<string, string>();
    const orderedTermIds = terms.map((term) => {
      termNameToId.set(term.name, term.id);
      return term.id;
    });
    const termIdSet = new Set(orderedTermIds);

    for (const classItem of classes) {
      if (classItem.isFullyOnDemand) {
        continue;
      }
      const slots = weeklySlotRecords[classItem.id] ?? [];
      const filteredSlots = slots.filter(
        (slot) => allowedWeekdays.has(slot.dayOfWeek) && availablePeriodKeys.has(slot.periodKey),
      );
      if (filteredSlots.length === 0) {
        continue;
      }

      const normalizedTermIds = classItem.termIds.filter((termId) => termIdSet.has(termId));
      const fallbackTermIds = classItem.termNames
        .map((name) => termNameToId.get(name))
        .filter((termId): termId is string => typeof termId === "string" && termIdSet.has(termId));
      const uniqueTermIds = Array.from(new Set([...normalizedTermIds, ...fallbackTermIds]));
      const targetTermIds = uniqueTermIds.length > 0 ? uniqueTermIds : orderedTermIds;

      for (const termId of targetTermIds) {
        const termMap = result.get(termId) ?? new Map<string, ScheduleCellItem[]>();
        for (const slot of filteredSlots) {
          const cellKey = `${slot.dayOfWeek}-${slot.periodKey}`;
          const current = termMap.get(cellKey) ?? [];
          current.push({
            classId: classItem.id,
            className: classItem.className,
            location: classItem.location,
            specialScheduleOption: classItem.specialScheduleOption,
          });
          termMap.set(cellKey, current);
        }
        result.set(termId, termMap);
      }
    }

    for (const [, termMap] of result) {
      for (const [key, list] of termMap) {
        termMap.set(
          key,
          list
            .slice()
            .sort((a, b) => a.className.localeCompare(b.className, "ja")),
        );
      }
    }

    return result;
  }, [classes, periodLabels, terms, weekdayHeaders, weeklySlotRecords]);

  const isWeeklySlotsLoading = useMemo(
    () => classes.some((classItem) => !initializedWeeklySlots[classItem.id]),
    [classes, initializedWeeklySlots],
  );

  const isScheduleLoading =
    classLoadState === "loading" ||
    (classLoadState === "success" && classes.length > 0 && isWeeklySlotsLoading);

  const releasePointerCapture = useCallback((pointerId: number | null) => {
    if (pointerId == null) {
      return;
    }
    const element = viewportRef.current;
    if (!element) {
      return;
    }
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // no-op: capture may already be released
    }
  }, []);

  const resetPointerState = useCallback(() => {
    isPointerDownRef.current = false;
    isDraggingRef.current = false;
    pointerIdRef.current = null;
    dragStartRef.current = 0;
    dragDeltaRef.current = 0;
  }, []);

  const settleToIndex = useCallback(
    (index: number) => {
      setIsAnimating(true);
      setActiveTermIndex((prev) => {
        if (prev === index) {
          return prev;
        }
        return index;
      });
      const offset = -index * viewportWidth;
      baseOffsetRef.current = offset;
      setTranslateX(offset);
    },
    [viewportWidth],
  );

  const finishPointerInteraction = useCallback(
    (options: { cancelled?: boolean; pointerId?: number; deltaOverride?: number } = {}) => {
      const { cancelled, pointerId, deltaOverride } = options;
      const currentIndex = clampedTermIndex;
      const delta = deltaOverride ?? dragDeltaRef.current;
      let nextIndex = currentIndex;

      if (!cancelled && viewportWidth > 0 && pagerItems.length > 1) {
        const threshold = viewportWidth * SWIPE_TRIGGER_RATIO;
        if (Math.abs(delta) > threshold) {
          if (delta < 0 && currentIndex < pagerItems.length - 1) {
            nextIndex = currentIndex + 1;
          } else if (delta > 0 && currentIndex > 0) {
            nextIndex = currentIndex - 1;
          }
        }
      }

      settleToIndex(nextIndex);
      if (pointerId != null) {
        releasePointerCapture(pointerId);
      }
      resetPointerState();
    },
    [clampedTermIndex, pagerItems.length, releasePointerCapture, resetPointerState, settleToIndex, viewportWidth],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enableSwipe) {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (isPointerDownRef.current) {
        return;
      }
      isPointerDownRef.current = true;
      pointerIdRef.current = event.pointerId;
      dragStartRef.current = event.clientX;
      dragDeltaRef.current = 0;
      baseOffsetRef.current = -clampedTermIndex * viewportWidth;
      isDraggingRef.current = false;
      setIsAnimating(false);
    },
    [clampedTermIndex, enableSwipe, viewportWidth],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enableSwipe) {
      return;
    }
    if (!isPointerDownRef.current || pointerIdRef.current !== event.pointerId) {
      return;
    }
    const delta = event.clientX - dragStartRef.current;
    if (!isDraggingRef.current) {
      if (Math.abs(delta) <= DRAG_DETECTION_THRESHOLD) {
        return;
      }
      isDraggingRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    }

    dragDeltaRef.current = delta;
    setTranslateX(baseOffsetRef.current + delta);
  }, [enableSwipe]);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isPointerDownRef.current || pointerIdRef.current !== event.pointerId) {
        return;
      }
      finishPointerInteraction({ pointerId: event.pointerId });
    },
    [finishPointerInteraction],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isPointerDownRef.current || pointerIdRef.current !== event.pointerId) {
        return;
      }
      finishPointerInteraction({ pointerId: event.pointerId, cancelled: true });
    },
    [finishPointerInteraction],
  );

  useEffect(() => {
    if (!enableSwipe) {
      return;
    }
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (!isPointerDownRef.current || pointerIdRef.current !== event.pointerId) {
        return;
      }
      finishPointerInteraction({ pointerId: event.pointerId });
    };
    const handleWindowPointerCancel = (event: PointerEvent) => {
      if (!isPointerDownRef.current || pointerIdRef.current !== event.pointerId) {
        return;
      }
      finishPointerInteraction({ pointerId: event.pointerId, cancelled: true });
    };

    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);

    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, [enableSwipe, finishPointerInteraction]);

  const activePagerItem = pagerItems[clampedTermIndex] ?? null;
  const activeTermId = activePagerItem && !activePagerItem.isPlaceholder ? activePagerItem.id : null;
  const activeTermHasEntries = activeTermId
    ? (scheduleByTerm.get(activeTermId)?.size ?? 0) > 0 ||
      (fullOnDemandByTerm.get(activeTermId)?.length ?? 0) > 0
    : false;

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-white">
        <div className="flex w-full flex-shrink-0 flex-col border-b border-neutral-200 bg-neutral-100/80">
          <nav className="flex items-center gap-1 overflow-x-auto px-1 py-1" role="tablist">
            {pagerItems.map((item, index) => {
            const isActive = index === clampedTermIndex;
            const isDisabled = Boolean(item.isPlaceholder);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (isDisabled) {
                    return;
                  }
                  setIsAnimating(true);
                  setActiveTermIndex(index);
                }}
                disabled={isDisabled}
                className={`whitespace-nowrap border-b-2 pb-1 text-sm font-semibold transition ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-neutral-600 hover:text-neutral-800"
                } ${isDisabled ? "cursor-default text-neutral-400" : ""}`}
                aria-selected={isActive}
                aria-disabled={isDisabled}
                role="tab"
              >
                {item.name}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="relative flex w-full flex-1 min-h-0">
        <div
          ref={viewportRef}
          className="h-full min-h-0 w-full overflow-hidden"
          style={{ touchAction: enableSwipe ? "pan-y" : "auto" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div
            className={`flex h-full min-h-0 w-full ${
              isAnimating ? "transition-transform duration-300 ease-out" : ""
            }`}
            style={{
              width: `${Math.max(pagerItems.length, 1) * 100}%`,
              transform: `translate3d(${translateX}px, 0, 0)`,
            }}
          >
            {pagerItems.map((item, index) => {
              const scheduleForTerm = !item.isPlaceholder ? scheduleByTerm.get(item.id) : null;
              const fullOnDemandEntries = !item.isPlaceholder
                ? fullOnDemandByTerm.get(item.id) ?? []
                : [];
              return (
                <div
                  key={item.id}
                  className="flex h-full min-h-0 w-full flex-shrink-0 flex-grow-0 flex-col"
                  style={{ width: `${100 / Math.max(pagerItems.length, 1)}%` }}
                  aria-hidden={index !== clampedTermIndex}
                >
                  <div className="flex h-full min-h-0 w-full flex-col">
                    <div
                      className="grid h-10 w-full flex-shrink-0 border-b border-l border-t border-neutral-200 bg-neutral-100"
                      style={{ gridTemplateColumns: columnTemplate }}
                    >
                      <div className="flex h-10 w-full items-center justify-center border-r border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-600" />
                      {weekdayHeaders.map((weekday) => (
                        <div
                          key={weekday.key}
                          className="flex h-10 items-center justify-center border-r border-neutral-200 bg-neutral-100 text-base font-semibold text-neutral-800"
                        >
                          {weekday.label}
                        </div>
                      ))}
                    </div>

                    <div className="flex-1 min-h-0 w-full">
                      <div
                        className="grid h-full w-full border-b border-l border-neutral-200"
                        style={{
                          gridTemplateColumns: columnTemplate,
                          ...(rowTemplate ? { gridTemplateRows: rowTemplate } : {}),
                        }}
                      >
                        {periodLabels.map((label) => {
                          const isFullOnDemandRow = label === "FOD";
                          if (isFullOnDemandRow) {
                            const weekdayCount = Math.max(weekdayHeaders.length, 1);
                            return (
                              <Fragment key={label}>
                                <div className="flex h-full w-full items-center justify-center border-b border-r border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                                  <span className="block w-full truncate">{label}</span>
                                </div>
                                <div
                                  className="flex h-full min-h-0 w-full flex-col border-b border-r border-neutral-200 bg-white"
                                  style={{ gridColumn: `span ${weekdayCount}` }}
                                >
                                  {fullOnDemandEntries.length > 0 ? (
                                    <div className="flex h-full min-h-0 w-full flex-wrap items-stretch gap-1 p-1">
                                      {fullOnDemandEntries.map((entry, entryIndex) => {
                                        const specialLabel =
                                          entry.specialScheduleOption !== "all"
                                            ? SPECIAL_SCHEDULE_OPTION_LABELS[
                                                entry.specialScheduleOption
                                              ]
                                            : null;
                                        const maxWidthPercent = 100 / weekdayCount;
                                        const basisPercent = Math.min(
                                          100 / fullOnDemandEntries.length,
                                          maxWidthPercent,
                                        );
                                        return (
                                          <button
                                            key={`${entry.classId}-full-${entryIndex}`}
                                            type="button"
                                            onClick={() =>
                                              handleOpenClassActivity({
                                                classId: entry.classId,
                                                className: entry.className,
                                                periods: ["OD"],
                                                detailLabel: "オンデマンド",
                                              })
                                            }
                                            className="flex min-h-0 flex-col gap-1 rounded-xl border border-blue-200 bg-blue-50 px-1 py-1 text-left"
                                            style={{
                                              flexBasis: `${basisPercent}%`,
                                              maxWidth: `${maxWidthPercent}%`,
                                              flexGrow: 1,
                                            }}
                                          >
                                            <div className="flex flex-1 min-h-0 items-center justify-center px-1">
                                              <p className="w-full whitespace-pre-wrap break-words text-center text-xs font-semibold leading-tight text-neutral-800">
                                                {entry.className}
                                              </p>
                                            </div>
                                            {specialLabel ? (
                                              <p className="flex h-4 w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-200/70 px-1 text-center text-[10px] font-semibold text-blue-700">
                                                <span className="block w-full truncate whitespace-nowrap">
                                                  {specialLabel}
                                                </span>
                                              </p>
                                            ) : null}
                                            {entry.location ? (
                                              <p className="flex h-4 w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900/10 px-1 text-center text-[10px] font-medium text-neutral-700">
                                                <span className="block w-full truncate whitespace-nowrap">
                                                  {entry.location}
                                                </span>
                                              </p>
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              </Fragment>
                            );
                          }

                          return (
                            <Fragment key={label}>
                              <div className="flex h-full w-full items-center justify-center border-b border-r border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                                <span className="block w-full truncate">{label}</span>
                              </div>
                              {weekdayHeaders.map((weekday) => {
                                const periodKey = label;
                                const cellKey = `${weekday.key}-${periodKey}`;
                                const entries = scheduleForTerm?.get(cellKey) ?? [];
                                return (
                                  <div
                                    key={`${label}-${weekday.key}`}
                                    className="flex h-full min-h-0 w-full flex-col border-b border-r border-neutral-200 bg-white"
                                  >
                                    {entries.length > 0 ? (
                                      <div className="flex h-full min-h-0 w-full flex-col gap-1 p-1">
                                      {entries.map((entry) => {
                                        const specialLabel =
                                          entry.specialScheduleOption !== "all"
                                            ? SPECIAL_SCHEDULE_OPTION_LABELS[
                                                entry.specialScheduleOption
                                              ]
                                            : null;
                                        const numericPeriod = Number.parseInt(periodKey, 10);
                                        const normalizedPeriods: (number | "OD")[] =
                                          periodKey === "OD"
                                            ? ["OD"]
                                            : Number.isFinite(numericPeriod)
                                            ? [numericPeriod]
                                            : [];
                                        const periodLabel = formatPeriodLabel(normalizedPeriods);
                                        const detailLabel = `${weekday.label}曜 ${periodLabel}`;
                                        return (
                                          <button
                                            key={`${entry.classId}-${weekday.key}-${periodKey}`}
                                            type="button"
                                            onClick={() =>
                                              handleOpenClassActivity({
                                                classId: entry.classId,
                                                className: entry.className,
                                                periods: normalizedPeriods,
                                                detailLabel,
                                              })
                                            }
                                            className="flex flex-1 min-h-0 w-full flex-col gap-1 rounded-xl border border-blue-200 bg-blue-50 px-1 py-1 text-left"
                                          >
                                            <div className="flex flex-1 min-h-0 items-center justify-center px-1">
                                              <p className="w-full whitespace-pre-wrap break-words text-center text-xs font-semibold leading-tight text-neutral-800">
                                                {entry.className}
                                              </p>
                                            </div>
                                            {specialLabel ? (
                                              <p className="flex h-4 w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-200/70 px-1 text-center text-[10px] font-semibold text-blue-700">
                                                <span className="block w-full truncate whitespace-nowrap">
                                                  {specialLabel}
                                                </span>
                                              </p>
                                            ) : null}
                                            {entry.location ? (
                                              <p className="flex h-4 w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900/10 px-1 text-center text-[10px] font-medium text-neutral-700">
                                                <span className="block w-full truncate whitespace-nowrap">
                                                  {entry.location}
                                                </span>
                                              </p>
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {termLoadState === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-neutral-500">
            学期情報を読み込んでいます…
          </div>
        ) : null}
        {termLoadState !== "loading" && isScheduleLoading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60 text-sm text-neutral-500">
            授業情報を読み込んでいます…
          </div>
        ) : null}
      </div>

      {activePagerItem?.isPlaceholder && termLoadState === "success" ? (
        <div className="px-1 pt-1 text-sm text-neutral-500">学期情報が設定されていません。</div>
      ) : null}

      {termLoadState === "error" && termError ? (
        <div className="mt-1 border border-red-200 bg-red-50 px-1 py-1 text-sm text-red-700">
          {termError}
        </div>
      ) : null}

      {classLoadState === "error" && classError ? (
        <div className="mt-1 border border-red-200 bg-red-50 px-1 py-1 text-sm text-red-700">
          {classError}
        </div>
      ) : null}

      {termLoadState === "success" &&
      !activePagerItem?.isPlaceholder &&
      !isScheduleLoading &&
      classLoadState !== "error" &&
      userId &&
      calendar &&
      !activeTermHasEntries ? (
        <div className="px-1 pt-1 text-sm text-neutral-500">選択した学期に表示できる授業がありません。</div>
      ) : null}

      </div>

      <ClassActivityOverlay
        open={Boolean(selectedActivity)}
        session={selectedActivity}
        fiscalYear={calendar?.fiscalYear ?? null}
        onClose={handleCloseClassActivity}
      />
    </>
  );
}
