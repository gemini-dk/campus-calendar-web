"use client";

import { useEffect, useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChalkboardTeacher, faCircleCheck, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { useUserSettings } from "@/lib/settings/UserSettingsProvider";
import { useAuth } from "@/lib/useAuth";
import { useRouter } from "next/navigation";

type CreditsStatus = "in_progress" | "completed" | "failed";

type ClassSubject = {
  id: string;
  name: string;
  termNames: string[];
  creditsStatus: CreditsStatus;
};

const STATUS_CONFIG: Record<CreditsStatus, { icon: IconDefinition; className: string; label: string }> = {
  in_progress: {
    icon: faChalkboardTeacher,
    className: "text-neutral-400",
    label: "履修中",
  },
  completed: {
    icon: faCircleCheck,
    className: "text-emerald-500",
    label: "習得済み",
  },
  failed: {
    icon: faCircleXmark,
    className: "text-red-500",
    label: "不合格",
  },
};

function mapClassSubject(doc: QueryDocumentSnapshot<DocumentData>): ClassSubject | null {
  const data = doc.data();

  const name = typeof data.className === "string" ? data.className.trim() : "";
  if (!name) {
    return null;
  }

  const termNames = Array.isArray(data.termNames)
    ? data.termNames.filter((term): term is string => typeof term === "string" && term.trim().length > 0)
    : [];

  const statusValue = typeof data.creditsStatus === "string" ? data.creditsStatus : "in_progress";
  const creditsStatus: CreditsStatus = STATUS_CONFIG[statusValue as CreditsStatus]
    ? (statusValue as CreditsStatus)
    : "in_progress";

  return {
    id: doc.id,
    name,
    termNames,
    creditsStatus,
  } satisfies ClassSubject;
}

export default function ClassSubjectsListView() {
  const { profile } = useAuth();
  const { settings } = useUserSettings();
  const router = useRouter();
  const fiscalYear = settings.calendar.fiscalYear;
  const fiscalYearLabel = fiscalYear ? `${fiscalYear}年度` : "年度未設定";

  const [subjects, setSubjects] = useState<ClassSubject[]>([]);

  useEffect(() => {
    if (!profile?.uid || !fiscalYear) {
      setSubjects([]);
      return;
    }

    const classesCollection = collection(
      db,
      "users",
      profile.uid,
      "academic_years",
      fiscalYear,
      "timetable_classes",
    );
    const classesQuery = query(classesCollection, orderBy("className", "asc"));

    const unsubscribe = onSnapshot(
      classesQuery,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((doc) => mapClassSubject(doc))
          .filter((subject): subject is ClassSubject => subject !== null);
        setSubjects(mapped);
      },
      (error) => {
        console.error("Failed to load timetable classes", error);
        setSubjects([]);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [profile?.uid, fiscalYear]);

  return (
    <div className="flex h-full w-full flex-col gap-4 py-6">
      <ul className="flex w-full flex-col gap-3">
        {subjects.map((subject) => {
          const status = STATUS_CONFIG[subject.creditsStatus];
          const termLabel = subject.termNames.length > 0 ? subject.termNames.join("・") : "-";

          return (
            <li
              key={subject.id}
              className="flex w-full items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-0 shadow-sm"
            >
              <button
                type="button"
                onClick={() => router.push(`/mobile/classes/${subject.id}/activity`)}
                className="flex h-full w-full items-center gap-4 rounded-2xl p-4 text-left transition hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                  <FontAwesomeIcon icon={status.icon} className={`text-2xl ${status.className}`} aria-hidden="true" />
                  <span className="sr-only">{status.label}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-medium text-neutral-600">{fiscalYearLabel} {termLabel}</p>
                  <p className="truncate text-base font-semibold text-neutral-900">{subject.name}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
