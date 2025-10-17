"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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

const DRAG_THRESHOLD_PX = 60;

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
    setTranslateX(-clampedTermIndex * viewportWidth);
  }, [clampedTermIndex, viewportWidth]);

  useEffect(() => {
    if (!calendar) {
      setTerms([]);
      setTermLoadState("error");
      setTermError("学事カレンダー設定が見つかりません。設定タブから登録してください。");
      setActiveTermIndex(0);
      setTranslateX(0);
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
    return `80px repeat(${weekdayCount}, minmax(0, 1fr))`;
  }, [weekdayHeaders.length]);

  const enableSwipe = pagerItems.length > 1;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enableSwipe) {
      return;
    }
    if (isDraggingRef.current) {
      return;
    }
    isDraggingRef.current = true;
    pointerIdRef.current = event.pointerId;
    dragStartRef.current = event.clientX;
    baseOffsetRef.current = -clampedTermIndex * viewportWidth;
    dragDeltaRef.current = 0;
    setIsAnimating(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) {
      return;
    }
    const delta = event.clientX - dragStartRef.current;
    dragDeltaRef.current = delta;
    setTranslateX(baseOffsetRef.current + delta);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) {
      return;
    }
    isDraggingRef.current = false;
    const delta = dragDeltaRef.current;
    const threshold = Math.min(DRAG_THRESHOLD_PX, viewportWidth / 4 || DRAG_THRESHOLD_PX);
    let nextIndex = clampedTermIndex;
    if (delta <= -threshold && clampedTermIndex < pagerItems.length - 1) {
      nextIndex = clampedTermIndex + 1;
    } else if (delta >= threshold && clampedTermIndex > 0) {
      nextIndex = clampedTermIndex - 1;
    }
    setIsAnimating(true);
    setActiveTermIndex(nextIndex);
    setTranslateX(-nextIndex * viewportWidth);
    if (pointerIdRef.current !== null) {
      try {
        event.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch (error) {
        // noop: releasing pointer capture may throw if already released
      }
    }
    pointerIdRef.current = null;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishDrag(event);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishDrag(event);
  };

  const activePagerItem = pagerItems[clampedTermIndex] ?? null;

  return (
    <div className="flex h-full min-h-[480px] w-full flex-col gap-4">
      <div className="flex h-12 w-full items-center justify-between px-1">
        <div>
          <div className="text-base font-semibold text-neutral-900">
            {activePagerItem?.name ?? "学期未設定"}
          </div>
          <div className="text-xs text-neutral-500">
            {calendar ? `${calendar.fiscalYear}年度` : "年度未設定"}
          </div>
        </div>
        {pagerItems.length > 1 ? (
          <div className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
            {clampedTermIndex + 1} / {pagerItems.length}
          </div>
        ) : null}
      </div>

      <div className="relative flex min-h-[380px] flex-1">
        <div
          ref={viewportRef}
          className="h-full w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
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
                className="flex h-full w-full flex-shrink-0 flex-grow-0 flex-col px-4 py-4"
                style={{ width: `${100 / Math.max(pagerItems.length, 1)}%` }}
                aria-hidden={index !== clampedTermIndex}
              >
                <div className="flex h-full w-full flex-col">
                  <div
                    className="grid w-full flex-shrink-0"
                    style={{ gridTemplateColumns: columnTemplate }}
                  >
                    <div className="flex h-12 items-center justify-center rounded-tl-2xl border-b border-neutral-200 bg-neutral-100 text-sm font-semibold text-neutral-600">
                      時限
                    </div>
                    {weekdayHeaders.map((weekday, weekdayIndex) => (
                      <div
                        key={weekday.key}
                        className={`flex h-12 items-center justify-center border-b border-neutral-200 bg-neutral-100 text-sm font-semibold text-neutral-600 ${
                          weekdayIndex === weekdayHeaders.length - 1 ? "rounded-tr-2xl" : ""
                        } ${weekdayIndex > 0 ? "border-l" : ""}`}
                      >
                        {weekday.label}
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 min-h-0">
                    <div
                      className="grid h-full w-full"
                      style={{
                        gridTemplateColumns: columnTemplate,
                        gridAutoRows: "minmax(72px, 1fr)",
                      }}
                    >
                      {periodLabels.map((label) => (
                        <Fragment key={label}>
                          <div className="flex h-full items-center justify-center border-b border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-600">
                            {label}
                          </div>
                          {weekdayHeaders.map((weekday, weekdayIndex) => (
                            <div
                              key={`${label}-${weekday.key}`}
                              className={`border-b border-neutral-200 ${
                                weekdayIndex > 0 ? "border-l" : ""
                              }`}
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
          <div className="pointer-events-none absolute inset-0 flex h-full w-full items-center justify-center rounded-2xl bg-white/60 text-sm text-neutral-500">
            学期情報を読み込んでいます…
          </div>
        ) : null}
      </div>

      {termLoadState === "error" && termError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {termError}
        </div>
      ) : null}

      {enableSwipe ? (
        <div className="flex h-5 w-full items-center justify-center gap-2">
          {pagerItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setIsAnimating(true);
                setActiveTermIndex(index);
              }}
              className={`h-2.5 w-2.5 rounded-full transition ${
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
