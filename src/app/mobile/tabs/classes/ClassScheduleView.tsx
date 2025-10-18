"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CalendarTerm } from "@/lib/data/schema/calendar";
import { getCalendarTerms } from "@/lib/data/service/calendar.service";

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

export default function ClassScheduleView({ calendar }: ClassScheduleViewProps) {
  const [terms, setTerms] = useState<CalendarTerm[]>([]);
  const [termLoadState, setTermLoadState] = useState<LoadState>("idle");
  const [termError, setTermError] = useState<string | null>(null);
  const [activeTermIndex, setActiveTermIndex] = useState(0);

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

  return (
    <div className="flex min-h-full w-full flex-1 flex-col bg-white">
      <div className="flex flex-col border-b border-neutral-200">
        <div className="flex items-baseline justify-between px-4 pt-3">
          <div className="text-sm font-medium text-neutral-500">
            {calendar ? `${calendar.fiscalYear}年度` : "年度未設定"}
          </div>
          {pagerItems.length > 1 ? (
            <div className="text-xs text-neutral-400">
              {clampedTermIndex + 1} / {pagerItems.length}
            </div>
          ) : null}
        </div>
        <nav className="mt-2 flex items-center gap-4 overflow-x-auto px-4 pb-2" role="tablist">
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
                className={`whitespace-nowrap border-b-2 pb-2 text-sm font-semibold transition ${
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
            {pagerItems.map((item, index) => (
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
                          {weekdayHeaders.map((weekday) => (
                            <div
                              key={`${label}-${weekday.key}`}
                              className="border-b border-r border-neutral-200 bg-white"
                            />
                          ))}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {termLoadState === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-neutral-500">
            学期情報を読み込んでいます…
          </div>
        ) : null}
      </div>

      {activePagerItem?.isPlaceholder && termLoadState === "success" ? (
        <div className="px-4 pt-3 text-sm text-neutral-500">学期情報が設定されていません。</div>
      ) : null}

      {termLoadState === "error" && termError ? (
        <div className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {termError}
        </div>
      ) : null}

      {enableSwipe ? (
        <div className="mt-4 flex h-5 w-full items-center justify-center gap-2">
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
