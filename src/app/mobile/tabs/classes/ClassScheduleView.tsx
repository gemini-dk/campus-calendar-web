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

import type { CalendarTerm } from "@/lib/data/schema/calendar";
import { getCalendarTerms } from "@/lib/data/service/calendar.service";
import type { SpecialScheduleOption } from "@/lib/data/service/class.service";
import { SPECIAL_SCHEDULE_OPTION_LABELS } from "@/lib/data/service/class.service";
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

const ADDITIONAL_PERIOD_LABELS = ["OD", "FOD"];
const PERIOD_COLUMN_WIDTH = "2ch";

const DRAG_DETECTION_THRESHOLD = 6;
const SWIPE_TRIGGER_RATIO = 0.25;

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

  return {
    id: doc.id,
    className,
    termIds,
    termNames,
    location,
    specialScheduleOption,
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
        setTerms(filtered);
        setActiveTermIndex(0);
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

  const periodLabels = useMemo(() => {
    const lessons = Math.max(0, calendar?.lessonsPerDay ?? 0);
    const numbers = Array.from({ length: lessons }, (_, index) => String(index + 1));
    return [...numbers, ...ADDITIONAL_PERIOD_LABELS];
  }, [calendar?.lessonsPerDay]);

  const columnTemplate = useMemo(() => {
    const weekdayCount = Math.max(weekdayHeaders.length, 1);
    return `${PERIOD_COLUMN_WIDTH} repeat(${weekdayCount}, minmax(0, 1fr))`;
  }, [weekdayHeaders.length]);

  const enableSwipe = pagerItems.length > 1;

  const scheduleByTerm = useMemo(() => {
    const result = new Map<string, Map<string, ScheduleCellItem[]>>();
    if (terms.length === 0 || classes.length === 0) {
      return result;
    }

    const allowedWeekdays = new Set(weekdayHeaders.map((weekday) => weekday.key));
    const availablePeriodKeys = new Set(periodLabels);
    const termNameToId = new Map<string, string>();
    const orderedTermIds = terms.map((term) => {
      termNameToId.set(term.name, term.id);
      return term.id;
    });
    const termIdSet = new Set(orderedTermIds);

    for (const classItem of classes) {
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
    ? (scheduleByTerm.get(activeTermId)?.size ?? 0) > 0
    : false;

  return (
    <div className="flex min-h-full w-full flex-1 flex-col bg-white">
      <div className="flex flex-col border-b border-neutral-200">
        <div className="flex items-baseline justify-between px-1 pt-1">
          <div className="text-sm font-medium text-neutral-500">
            {calendar ? `${calendar.fiscalYear}年度` : "年度未設定"}
          </div>
          {pagerItems.length > 1 ? (
            <div className="text-xs text-neutral-400">
              {clampedTermIndex + 1} / {pagerItems.length}
            </div>
          ) : null}
        </div>
        <nav className="mt-1 flex items-center gap-1 overflow-x-auto px-1 pb-1" role="tablist">
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
                    : "border-transparent text-neutral-500 hover:text-neutral-700"
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

      <div className="relative flex flex-1">
        <div
          ref={viewportRef}
          className="h-full w-full overflow-hidden"
          style={{ touchAction: enableSwipe ? "pan-y" : "auto" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div
            className={`flex h-full w-full ${isAnimating ? "transition-transform duration-300 ease-out" : ""}`}
            style={{
              width: `${Math.max(pagerItems.length, 1) * 100}%`,
              transform: `translate3d(${translateX}px, 0, 0)`,
            }}
          >
            {pagerItems.map((item, index) => {
              const scheduleForTerm = !item.isPlaceholder ? scheduleByTerm.get(item.id) : null;
              return (
                <div
                  key={item.id}
                  className="flex h-full w-full flex-shrink-0 flex-grow-0 flex-col"
                  style={{ width: `${100 / Math.max(pagerItems.length, 1)}%` }}
                  aria-hidden={index !== clampedTermIndex}
                >
                  <div className="flex h-full w-full flex-col">
                    <div
                      className="grid w-full border-b border-l border-t border-neutral-200"
                      style={{ gridTemplateColumns: columnTemplate }}
                    >
                      <div className="h-12 border-r border-neutral-200" />
                      {weekdayHeaders.map((weekday) => (
                        <div
                          key={weekday.key}
                          className="flex h-12 items-center justify-center border-r border-neutral-200 bg-white text-sm font-semibold text-neutral-700"
                        >
                          {weekday.label}
                        </div>
                      ))}
                    </div>

                    <div className="flex-1">
                      <div
                        className="grid h-full w-full border-b border-l border-neutral-200"
                        style={{
                          gridTemplateColumns: columnTemplate,
                          gridAutoRows: "minmax(64px, 1fr)",
                        }}
                      >
                        {periodLabels.map((label) => (
                          <Fragment key={label}>
                            <div className="flex items-center justify-center border-b border-r border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                              <span className="block truncate">{label}</span>
                            </div>
                            {weekdayHeaders.map((weekday) => {
                              const periodKey = label;
                              const cellKey = `${weekday.key}-${periodKey}`;
                              const entries = scheduleForTerm?.get(cellKey) ?? [];
                              return (
                                <div
                                  key={`${label}-${weekday.key}`}
                                  className="border-b border-r border-neutral-200 bg-white"
                                >
                                  {entries.length > 0 ? (
                                    <div className="flex h-full w-full flex-col gap-1 p-1">
                                      {entries.map((entry) => {
                                        const specialLabel =
                                          entry.specialScheduleOption !== "all"
                                            ? SPECIAL_SCHEDULE_OPTION_LABELS[
                                                entry.specialScheduleOption
                                              ]
                                            : null;
                                        return (
                                          <div
                                            key={`${entry.classId}-${weekday.key}-${periodKey}`}
                                            className="flex min-h-[72px] w-full flex-col rounded-xl border border-blue-200 bg-blue-50 px-1 py-1"
                                          >
                                            <div className="flex flex-1 items-center justify-center px-1">
                                              <p className="w-full whitespace-pre-wrap break-words text-center text-xs font-semibold leading-tight text-neutral-800">
                                                {entry.className}
                                              </p>
                                            </div>
                                            {specialLabel ? (
                                              <p className="mt-1 w-full overflow-hidden rounded-full bg-blue-200/70 px-1 py-0 text-center text-[10px] font-semibold text-blue-700">
                                                <span className="block truncate whitespace-nowrap">
                                                  {specialLabel}
                                                </span>
                                              </p>
                                            ) : null}
                                            {entry.location ? (
                                              <p className="mt-1 w-full overflow-hidden rounded-full bg-neutral-900/10 px-1 py-0 text-center text-[10px] font-medium text-neutral-700">
                                                <span className="block truncate whitespace-nowrap">
                                                  {entry.location}
                                                </span>
                                              </p>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
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

      {enableSwipe ? (
        <div className="mt-1 flex h-5 w-full items-center justify-center gap-1">
          {pagerItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setIsAnimating(true);
                setActiveTermIndex(index);
              }}
              className={`h-2 w-2 rounded-full transition ${
                index === clampedTermIndex ? "bg-blue-600" : "bg-neutral-300 hover:bg-neutral-400"
              }`}
              aria-label={`${index + 1}番目の学期を表示`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
