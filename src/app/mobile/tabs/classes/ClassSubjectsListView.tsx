"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChalkboardTeacher, faCircleCheck, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type CreditsStatus = "in_progress" | "completed" | "failed";

type ClassSubject = {
  id: string;
  fiscalYear: string;
  terms: string[];
  name: string;
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

const CLASS_SUBJECTS: ClassSubject[] = [
  {
    id: "2025-spring-linear-algebra",
    fiscalYear: "2025",
    terms: ["前期"],
    name: "線形代数",
    creditsStatus: "in_progress",
  },
  {
    id: "2025-fullyear-information-science",
    fiscalYear: "2025",
    terms: ["通年"],
    name: "情報科学概論",
    creditsStatus: "completed",
  },
  {
    id: "2024-fall-microeconomics",
    fiscalYear: "2024",
    terms: ["後期"],
    name: "ミクロ経済学",
    creditsStatus: "failed",
  },
  {
    id: "2024-spring-english",
    fiscalYear: "2024",
    terms: ["前期", "集中"],
    name: "アカデミックライティング",
    creditsStatus: "in_progress",
  },
];

export default function ClassSubjectsListView() {
  return (
    <div className="flex h-full w-full flex-col gap-4 py-6">
      <section className="flex w-full flex-col gap-3">
        <h2 className="text-base font-semibold text-neutral-900">履修中の授業科目</h2>
        <p className="text-sm text-neutral-600">
          履修状況や年度ごとの授業を確認できます。授業の追加・編集は右下の「授業を追加」ボタンから行ってください。
        </p>
      </section>

      <section className="flex h-full w-full flex-col gap-4">
        <ul className="flex w-full flex-col gap-3">
          {CLASS_SUBJECTS.map((subject) => {
            const status = STATUS_CONFIG[subject.creditsStatus];
            const termLabel = subject.terms.join("・");

            return (
              <li
                key={subject.id}
                className="flex w-full items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                  <FontAwesomeIcon
                    icon={status.icon}
                    className={`text-2xl ${status.className}`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{status.label}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-medium text-neutral-600">
                    {subject.fiscalYear}年度 {termLabel}
                  </p>
                  <p className="truncate text-base font-semibold text-neutral-900">{subject.name}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
