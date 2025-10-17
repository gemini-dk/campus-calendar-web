"use client";

import { useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendar,
  faChalkboardTeacher,
  faHome,
  faTasks,
  faUserCircle,
} from "@fortawesome/free-solid-svg-icons";

import HomeTab from "./tabs/HomeTab";
import CalendarTab from "./tabs/CalendarTab";
import TodoTab from "./tabs/TodoTab";
import ClassesTab from "./tabs/ClassesTab";
import UserTab from "./tabs/UserTab";
import type { TabDefinition, TabId } from "./tabs/types";

const TABS: TabDefinition[] = [
  { id: "home", label: "Home", icon: faHome, Component: HomeTab },
  { id: "calendar", label: "Calendar", icon: faCalendar, Component: CalendarTab },
  { id: "todo", label: "Todo", icon: faTasks, Component: TodoTab },
  { id: "classes", label: "授業", icon: faChalkboardTeacher, Component: ClassesTab },
  { id: "user", label: "ユーザ", icon: faUserCircle, Component: UserTab },
];

export default function MobilePage() {
  const [activeTab, setActiveTab] = useState<TabId>("home");

  const currentTab = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const ActiveComponent = currentTab.Component;

  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-neutral-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[800px] flex-col bg-white">
        <header className="flex h-[30px] flex-shrink-0 items-center justify-center border-b border-neutral-200">
          <span className="text-sm font-semibold text-neutral-900">CampusCalendar</span>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-neutral-50">
            <ActiveComponent />
          </div>
        </main>

        <nav className="flex h-[60px] flex-shrink-0 border-t border-neutral-200">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex h-full flex-1 flex-col items-center justify-center gap-1 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <FontAwesomeIcon icon={tab.icon} fontSize={22} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
