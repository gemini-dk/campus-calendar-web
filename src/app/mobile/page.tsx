"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { signInAnonymously } from "firebase/auth";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendar,
  faChalkboardTeacher,
  faHome,
  faTasks,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import HomeTab from "./tabs/HomeTab";
import CalendarTab from "./tabs/CalendarTab";
import WeeklyCalendarTab from "./tabs/WeeklyCalendarTab";
import TodoTab from "./tabs/TodoTab";
import ClassesTab from "./tabs/ClassesTab";
import CalendarOverlayIcon from "./components/CalendarOverlayIcon";
import { ActivityDialogProvider } from "./components/ActivityDialogProvider";
import DailyCalendarOverlay from "./components/DailyCalendarOverlay";
import type { TabDefinition, TabId } from "./tabs/types";
import { auth } from "@/lib/firebase/client";
import { ensureCalendarDataIsCached } from "@/lib/data/service/calendar.service";
import { CalendarConflictError, useUserSettings } from "@/lib/settings/UserSettingsProvider";
import { useAuth } from "@/lib/useAuth";

const TAB_ICON_SIZE = 24;

const renderDefaultTabIcon = (icon: IconDefinition) => (
  <span className="flex h-6 w-6 items-center justify-center" aria-hidden="true">
    <FontAwesomeIcon icon={icon} fontSize={TAB_ICON_SIZE} />
  </span>
);

const TABS: TabDefinition[] = [
  { id: "home", label: "ホーム", icon: renderDefaultTabIcon(faHome), Component: HomeTab },
  {
    id: "weekly",
    label: "ウィークリー",
    icon: <CalendarOverlayIcon baseIcon={faCalendar} label="7" size={TAB_ICON_SIZE + 2} />,
    Component: WeeklyCalendarTab,
  },
  {
    id: "calendar",
    label: "カレンダー",
    icon: <CalendarOverlayIcon baseIcon={faCalendar} label="31" size={TAB_ICON_SIZE + 2} />,
    Component: CalendarTab,
  },
  { id: "todo", label: "課題・メモ", icon: renderDefaultTabIcon(faTasks), Component: TodoTab },
  {
    id: "classes",
    label: "授業管理",
    icon: renderDefaultTabIcon(faChalkboardTeacher),
    Component: ClassesTab,
  },
];

function MobilePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { settings, initialized: settingsInitialized, installCalendar, setActiveCalendar } =
    useUserSettings();
  const { isAuthenticated, initializing } = useAuth();

  useEffect(() => {
    if (!settingsInitialized) {
      return;
    }
    const fiscalYear = settings.calendar.fiscalYear.trim();
    const calendarId = settings.calendar.calendarId.trim();
    if (!fiscalYear || !calendarId) {
      return;
    }

    ensureCalendarDataIsCached(fiscalYear, calendarId).catch((error) => {
      console.error("学事カレンダーのキャッシュ生成に失敗しました。", error);
    });
  }, [settings.calendar.calendarId, settings.calendar.fiscalYear, settingsInitialized]);

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
  const [dailyOverlayDateId, setDailyOverlayDateId] = useState<string | null>(null);
  const [isCalendarDialogOpen, setIsCalendarDialogOpen] = useState(false);
  const [calendarDialogError, setCalendarDialogError] = useState<string | null>(null);
  const [isApplyingCalendar, setIsApplyingCalendar] = useState(false);

  type CalendarSetupCandidate = {
    fiscalYear: string;
    calendarId: string;
    calendarName: string;
    universityName: string;
    webId: string;
    hasSaturdayClasses: boolean;
  };

  const calendarCandidate = useMemo<CalendarSetupCandidate | null>(() => {
    const fiscalYearParam =
      searchParams.get("calendarFiscalYear") ??
      searchParams.get("fiscalYear") ??
      searchParams.get("year");
    const calendarIdParam = searchParams.get("calendarId");
    const calendarNameParam = searchParams.get("calendarName");
    const universityNameParam = searchParams.get("universityName");
    const webIdParam = searchParams.get("webId");
    const hasSaturdayClassesParam = searchParams.get("hasSaturdayClasses");

    if (
      !fiscalYearParam ||
      !calendarIdParam ||
      !calendarNameParam ||
      !universityNameParam ||
      !webIdParam
    ) {
      return null;
    }

    const fiscalYear = fiscalYearParam.trim();
    const calendarId = calendarIdParam.trim();
    const calendarName = calendarNameParam.trim();
    const universityName = universityNameParam.trim();
    const webId = webIdParam.trim();
    const hasSaturdayClasses = (() => {
      if (!hasSaturdayClassesParam) {
        return false;
      }
      const normalized = hasSaturdayClassesParam.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    })();

    if (!fiscalYear || !calendarId || !calendarName || !universityName || !webId) {
      return null;
    }

    return {
      fiscalYear,
      calendarId,
      calendarName,
      universityName,
      webId,
      hasSaturdayClasses,
    } satisfies CalendarSetupCandidate;
  }, [searchParams]);

  const [pendingCalendar, setPendingCalendar] = useState<CalendarSetupCandidate | null>(
    calendarCandidate,
  );
  const autoAppliedCalendarKeyRef = useRef<string | null>(null);

  const calendarCandidateKey = useMemo(() => {
    if (!calendarCandidate) {
      return null;
    }
    return `${calendarCandidate.fiscalYear}:${calendarCandidate.calendarId}:${calendarCandidate.calendarName}:${calendarCandidate.webId}`;
  }, [calendarCandidate]);

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

  const clearCalendarParams = useCallback(() => {
    updateSearchParams((params) => {
      params.delete("calendarFiscalYear");
      params.delete("fiscalYear");
      params.delete("year");
      params.delete("calendarId");
      params.delete("calendarName");
      params.delete("universityName");
      params.delete("webId");
      params.delete("hasSaturdayClasses");
    });
  }, [updateSearchParams]);

  const applyCalendarSettings = useCallback(
    async (
      candidate: CalendarSetupCandidate,
      options?: { replaceExisting?: boolean; lessonsPerDayOverride?: number },
    ) => {
      const fallbackEntry = settings.calendar.entries.find(
        (entry) => entry.fiscalYear === settings.calendar.fiscalYear,
      ) ?? settings.calendar.entries[0] ?? null;
      const lessonsPerDay =
        options?.lessonsPerDayOverride ?? fallbackEntry?.lessonsPerDay ?? 6;

      await installCalendar(
        {
          fiscalYear: candidate.fiscalYear,
          calendarId: candidate.calendarId,
          calendarName: candidate.calendarName,
          universityName: candidate.universityName,
          webId: candidate.webId,
          hasSaturdayClasses: candidate.hasSaturdayClasses,
          lessonsPerDay,
        },
        { replaceExisting: options?.replaceExisting },
      );
    },
    [installCalendar, settings.calendar.entries, settings.calendar.fiscalYear],
  );

  useEffect(() => {
    if (initializing || !settingsInitialized) {
      return;
    }

    if (!calendarCandidate) {
      setPendingCalendar(null);
      setIsCalendarDialogOpen(false);
      setCalendarDialogError(null);
      setIsApplyingCalendar(false);
      autoAppliedCalendarKeyRef.current = null;
      return;
    }

    setPendingCalendar(calendarCandidate);
    setCalendarDialogError(null);

    const candidateKey = calendarCandidateKey;
    if (!candidateKey) {
      return;
    }

    if (autoAppliedCalendarKeyRef.current === candidateKey) {
      return;
    }

    const existingEntry = settings.calendar.entries.find(
      (entry) => entry.fiscalYear === calendarCandidate.fiscalYear,
    );
    const isLoggedIn = isAuthenticated || Boolean(auth.currentUser);

    if (isLoggedIn && existingEntry && existingEntry.calendarId !== calendarCandidate.calendarId) {
      setIsApplyingCalendar(false);
      setIsCalendarDialogOpen(true);
      return;
    }

    let canceled = false;

    const run = async () => {
      setIsApplyingCalendar(true);

      try {
        if (!isLoggedIn) {
          await signInAnonymously(auth);
        }

        if (canceled) {
          return;
        }

        if (!existingEntry) {
          autoAppliedCalendarKeyRef.current = candidateKey;
          await applyCalendarSettings(calendarCandidate, { replaceExisting: true });
          if (canceled) {
            return;
          }
          clearCalendarParams();
          setPendingCalendar(null);
          setIsCalendarDialogOpen(false);
          return;
        }

        autoAppliedCalendarKeyRef.current = candidateKey;
        await setActiveCalendar(existingEntry.fiscalYear, existingEntry.calendarId);
        if (canceled) {
          return;
        }
        clearCalendarParams();
        setPendingCalendar(null);
        setIsCalendarDialogOpen(false);
      } catch (error) {
        if (canceled) {
          return;
        }
        if (error instanceof CalendarConflictError) {
          autoAppliedCalendarKeyRef.current = null;
          setIsCalendarDialogOpen(true);
          setCalendarDialogError(null);
        } else {
          console.error('Failed to auto apply calendar settings from query.', error);
          setCalendarDialogError(
            'カレンダーの設定に失敗しました。時間をおいて再度お試しください。',
          );
        }
      } finally {
        if (!canceled) {
          setIsApplyingCalendar(false);
        }
      }
    };

    void run();

    return () => {
      canceled = true;
    };
  }, [
    applyCalendarSettings,
    calendarCandidate,
    calendarCandidateKey,
    clearCalendarParams,
    initializing,
    isAuthenticated,
    settingsInitialized,
    setActiveCalendar,
    settings.calendar.entries,
  ]);

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
      setDailyOverlayDateId(dateId);
      updateSearchParams((params) => {
        params.set("date", dateId);
      });
    },
    [updateSearchParams],
  );

  const handleCloseDailyOverlay = useCallback(() => {
    setDailyOverlayDateId(null);
  }, []);

  const handleConfirmCalendarSetup = useCallback(async () => {
    if (!pendingCalendar) {
      return;
    }

    setCalendarDialogError(null);
    setIsApplyingCalendar(true);

    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }

      const existingEntry = settings.calendar.entries.find(
        (entry) => entry.fiscalYear === pendingCalendar.fiscalYear,
      );

      await applyCalendarSettings(pendingCalendar, {
        replaceExisting: true,
        lessonsPerDayOverride: existingEntry?.lessonsPerDay,
      });
      setIsCalendarDialogOpen(false);
      setPendingCalendar(null);
      clearCalendarParams();
    } catch (error) {
      if (error instanceof CalendarConflictError) {
        setCalendarDialogError('同じ年度のカレンダーが別の端末で更新されました。再度お試しください。');
      } else {
        console.error('Failed to apply calendar settings from query.', error);
        setCalendarDialogError(
          'カレンダーの設定に失敗しました。時間をおいて再度お試しください。',
        );
      }
    } finally {
      setIsApplyingCalendar(false);
    }
  }, [
    applyCalendarSettings,
    clearCalendarParams,
    pendingCalendar,
    settings.calendar.entries,
  ]);

  const handleCancelCalendarSetup = useCallback(() => {
    setIsCalendarDialogOpen(false);
    setPendingCalendar(null);
    setCalendarDialogError(null);
    clearCalendarParams();
  }, [clearCalendarParams]);

  const currentTab = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const ActiveComponent = currentTab.Component;

  return (
    <div className="flex h-full min-h-[100svh] w-full justify-center bg-neutral-100">
      {isCalendarDialogOpen && pendingCalendar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 py-10">
          <div className="w-full max-w-[360px] rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-neutral-900">このカレンダーを設定しますか？</h2>
            <p className="mt-3 text-base font-medium text-neutral-800">
              {pendingCalendar.fiscalYear}年度　{pendingCalendar.calendarName}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              現在のカレンダー設定をこの内容に変更します。
            </p>
            {calendarDialogError ? (
              <p className="mt-3 text-xs text-red-600">{calendarDialogError}</p>
            ) : null}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelCalendarSetup}
                disabled={isApplyingCalendar}
                className="rounded-full px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400"
              >
                いいえ
              </button>
              <button
                type="button"
                onClick={handleConfirmCalendarSetup}
                disabled={isApplyingCalendar}
                className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isApplyingCalendar ? "設定中..." : "はい"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex h-full min-h-[100svh] w-full max-w-[800px] flex-col bg-white">
        <main className="flex flex-1 flex-col overflow-hidden pb-4">
          <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-50">
            {currentTab.id === "calendar" ? (
              <CalendarTab
                key={calendarResetKey}
                onDateSelect={handleCalendarDateSelect}
              />
            ) : currentTab.id === "weekly" ? (
              <WeeklyCalendarTab
                key={weeklyResetKey}
                onDateSelect={handleCalendarDateSelect}
              />
            ) : (
              <ActiveComponent />
            )}
          </div>
        </main>

        <nav className="flex h-[80px] flex-shrink-0 items-center justify-center bg-transparent px-5 pb-5">
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
                  data-active={isActive}
                  className={`group flex h-[48px] flex-1 items-center justify-center rounded-full text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-500 text-white shadow"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {tab.icon}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
      <DailyCalendarOverlay
        open={dailyOverlayDateId !== null}
        dateId={dailyOverlayDateId}
        onClose={handleCloseDailyOverlay}
      />
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
      <ActivityDialogProvider>
        <MobilePageContent />
      </ActivityDialogProvider>
    </Suspense>
  );
}
