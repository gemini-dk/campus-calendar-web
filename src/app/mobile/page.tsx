"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faCalendarWeek,
  faChalkboardTeacher,
  faHome,
  faTasks,
} from "@fortawesome/free-solid-svg-icons";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import HomeTab from "./tabs/HomeTab";
import CalendarTab from "./tabs/CalendarTab";
import WeeklyCalendarTab from "./tabs/WeeklyCalendarTab";
import TodoTab from "./tabs/TodoTab";
import ClassesTab from "./tabs/ClassesTab";
import type { TabDefinition, TabId } from "./tabs/types";

const TABS: TabDefinition[] = [
  { id: "home", label: "ホーム", icon: faHome, Component: HomeTab },
  { id: "weekly", label: "ウィークリー", icon: faCalendarWeek, Component: WeeklyCalendarTab },
  { id: "calendar", label: "カレンダー", icon: faCalendarDays, Component: CalendarTab },
  { id: "todo", label: "課題・メモ", icon: faTasks, Component: TodoTab },
  { id: "classes", label: "授業管理", icon: faChalkboardTeacher, Component: ClassesTab },
];

function MobilePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabFromParams = useMemo<TabId>(() => {
    const param = searchParams.get("tab");
    if (
      param === "home" ||
      param === "weekly" ||
      param === "calendar" ||
      param === "todo" ||
      param === "classes"
    ) {
      return param;
    }
    return "home";
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<TabId>(tabFromParams);
  const [calendarResetKey, setCalendarResetKey] = useState(0);
  const [weeklyResetKey, setWeeklyResetKey] = useState(0);

  useEffect(() => {
    setActiveTab((prev) => (prev === tabFromParams ? prev : tabFromParams));
  }, [tabFromParams]);

  const updateSearchParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      updater(params);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const formatDateId = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const handleTabChange = useCallback(
    (nextTab: TabId) => {
      if (nextTab === activeTab) {
        if (nextTab === "home") {
          const todayId = formatDateId(new Date());
          updateSearchParams((params) => {
            params.set("tab", "home");
            params.set("date", todayId);
          });
        } else if (nextTab === "calendar") {
          setCalendarResetKey((prev) => prev + 1);
        } else if (nextTab === "weekly") {
          setWeeklyResetKey((prev) => prev + 1);
        }
        return;
      }

      setActiveTab(nextTab);
      updateSearchParams((params) => {
        params.set("tab", nextTab);
      });
    },
    [activeTab, formatDateId, updateSearchParams],
  );

  const handleCalendarDateSelect = useCallback(
    (dateId: string) => {
      setActiveTab("home");
      updateSearchParams((params) => {
        params.set("tab", "home");
        params.set("date", dateId);
      });
    },
    [updateSearchParams],
  );

  const currentTab = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const ActiveComponent = currentTab.Component;

  return (
    <div className="flex h-full min-h-[100svh] w-full justify-center bg-neutral-100">
      <div className="mx-auto flex h-full min-h-[100svh] w-full max-w-[800px] flex-col bg-white">

        <main className="flex flex-1 flex-col overflow-hidden pb-4">
          <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-50">
            {currentTab.id === "calendar" ? (
              <CalendarTab
                key={calendarResetKey}
                onDateSelect={handleCalendarDateSelect}
              />
            ) : currentTab.id === "weekly" ? (
              <WeeklyCalendarTab key={weeklyResetKey} />
            ) : (
              <ActiveComponent />
            )}
          </div>
        </main>

        <nav className="flex h-[80px] flex-shrink-0 items-end justify-center bg-transparent px-5 pb-3">
          <div className="flex h-[64px] w-full max-w-[420px] items-center gap-3 rounded-full bg-white px-5 py-2 shadow-lg ring-1 ring-neutral-200">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  aria-label={tab.label}
                  data-glitch="ﾓｼﾞﾊﾞｹ"
                  className={`flex h-[48px] flex-1 items-center justify-center rounded-full text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-500 text-white shadow"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  <FontAwesomeIcon icon={tab.icon} fontSize={24} />
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default function MobilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[100svh] w-full items-center justify-center bg-neutral-100 text-sm text-neutral-600">
          読み込み中...
        </div>
      }
    >
      <MobilePageContent />
    </Suspense>
  );
}
