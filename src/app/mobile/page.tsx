"use client";

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/useAuth";

type TabId = "home" | "calendar" | "todo" | "classes" | "user";

type TabDefinition = {
  id: TabId;
  label: string;
};

const TABS: TabDefinition[] = [
  { id: "home", label: "Home" },
  { id: "calendar", label: "Calendar" },
  { id: "todo", label: "Todo" },
  { id: "classes", label: "授業" },
  { id: "user", label: "ユーザ" },
];

export default function MobilePage() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const {
    profile,
    isAuthenticated,
    initializing,
    isProcessing,
    error,
    successMessage,
    signInWithGoogle,
    signOut,
  } = useAuth();

  const tabContent = useMemo(() => {
    if (activeTab === "user") {
      if (initializing) {
        return (
          <div className="flex min-h-full items-center justify-center p-4 text-sm text-neutral-600">
            読み込み中...
          </div>
        );
      }

      if (isAuthenticated) {
        return (
          <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4 text-neutral-800">
            <p className="text-base font-medium">
              {profile?.displayName ?? "ユーザ"} さんでログイン中
            </p>
            <button
              type="button"
              onClick={signOut}
              disabled={isProcessing}
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {isProcessing ? "処理中..." : "ログアウト"}
            </button>
            {(error || successMessage) && (
              <div className="text-center text-xs">
                {error ? (
                  <p className="text-red-600">{error}</p>
                ) : (
                  <p className="text-green-600">{successMessage}</p>
                )}
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4 text-neutral-800">
          <p className="text-base">ログインして機能を利用しましょう。</p>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={isProcessing}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isProcessing ? "処理中..." : "Googleでログイン"}
          </button>
          {(error || successMessage) && (
            <div className="text-center text-xs">
              {error ? (
                <p className="text-red-600">{error}</p>
              ) : (
                <p className="text-green-600">{successMessage}</p>
              )}
            </div>
          )}
        </div>
      );
    }

    return <div className="min-h-full" />;
  }, [
    activeTab,
    error,
    initializing,
    isAuthenticated,
    isProcessing,
    profile?.displayName,
    signInWithGoogle,
    signOut,
    successMessage,
  ]);

  return (
    <div className="flex min-h-screen w-full justify-center bg-neutral-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[800px] flex-col bg-white">
        <header className="flex h-[30px] flex-shrink-0 items-center justify-center border-b border-neutral-200">
          <span className="text-sm font-semibold text-neutral-900">CampusCalendar</span>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-blue-50">{tabContent}</div>
        </main>

        <nav className="flex h-[50px] flex-shrink-0 border-t border-neutral-200">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex h-full flex-1 items-center justify-center text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
