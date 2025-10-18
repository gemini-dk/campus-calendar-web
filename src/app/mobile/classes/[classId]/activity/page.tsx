"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faChalkboardTeacher,
  faCircleQuestion,
  faListCheck,
  faNoteSticky,
  faPen,
  faPlay,
  faVideo,
} from "@fortawesome/free-solid-svg-icons";
import { faSquare, faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { useParams, useSearchParams } from "next/navigation";

import AttendanceSummary from "@/app/mobile/components/AttendanceSummary";
import AttendanceToggleGroup from "@/app/mobile/components/AttendanceToggleGroup";
import CreateClassDialog, {
  type EditClassInitialData,
} from "@/app/mobile/tabs/classes/CreateClassDialog";
import type { CalendarOption } from "@/app/mobile/tabs/classes/TermSettingsDialog";
import type { AttendanceStatus, AttendanceSummary as AttendanceSummaryType } from "@/app/mobile/types";
import {
  buildAbsenceMessage,
  ClassType,
  computeAttendanceSummary,
  formatPeriodLabel,
  mapTimetableClassDate,
  type TimetableClassDateDoc,
} from "@/app/mobile/utils/classSchedule";
import {
  SPECIAL_SCHEDULE_OPTION_LABELS,
  type SpecialScheduleOption,
  type WeeklySlotSelection,
} from "@/lib/data/service/class.service";
import { useUserSettings } from "@/lib/settings/UserSettingsProvider";
import { useAuth } from "@/lib/useAuth";
import { db } from "@/lib/firebase/client";

const WEEKDAY_LABELS = new Map<number, string>([
  [1, "月"],
  [2, "火"],
  [3, "水"],
  [4, "木"],
  [5, "金"],
  [6, "土"],
  [7, "日"],
]);

const CLASS_TYPE_LABELS: Record<ClassType, string> = {
  in_person: "対面",
  online: "オンライン",
  hybrid: "ハイブリッド",
  on_demand: "オンデマンド",
};

const CLASS_TYPE_ICONS: Record<ClassType, IconDefinition> = {
  in_person: faChalkboardTeacher,
  online: faVideo,
  hybrid: faCircleQuestion,
  on_demand: faPlay,
};

const CLASS_TYPE_ICON_CLASS: Record<ClassType, string> = {
  in_person: "text-blue-600",
  online: "text-purple-600",
  hybrid: "text-sky-600",
  on_demand: "text-amber-500",
};

type WeeklySlot = {
  id: string;
  dayOfWeek: number;
  period: number;
  displayOrder: number;
};

type ClassDetail = {
  id: string;
  className: string;
  classType: ClassType;
  location: string | null;
  locationInPerson: string | null;
  locationOnline: string | null;
  teacher: string | null;
  fiscalYear: string | null;
  calendarId: string | null;
  termDisplayName: string | null;
  termNames: string[];
  termIds: string[];
  specialScheduleOption: SpecialScheduleOption;
  isFullyOnDemand: boolean;
  credits: number | null;
  creditsStatus: "in_progress" | "completed" | "failed";
  maxAbsenceDays: number | null;
  omitWeeklySlots: boolean;
};

type ActivityStatus = "pending" | "done";

type ActivityType = "assignment" | "memo";

type ActivityDoc = {
  id: string;
  title: string;
  notes: string;
  type: ActivityType;
  status: ActivityStatus;
  dueDate: string | null;
  classId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type ClassSessionRecord = {
  kind: "session";
  id: string;
  timestamp: number;
  classDate: string;
  classDateId: string;
  attendanceStatus: AttendanceStatus;
  periods: (number | "OD")[];
  isCancelled: boolean;
  isTest: boolean;
};

type ActivityRecord = {
  kind: "activity";
  id: string;
  timestamp: number;
  activity: ActivityDoc;
};

type CombinedRecord = ClassSessionRecord | ActivityRecord;

type ClassActivityState = {
  classDetail: ClassDetail | null;
  weeklySlots: WeeklySlot[];
  classDates: TimetableClassDateDoc[];
  attendanceSummary: AttendanceSummaryType | null;
  activities: ActivityDoc[];
  loading: boolean;
  error: string | null;
};

function parseTimestamp(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value === "string") {
    const fromString = new Date(value);
    return Number.isNaN(fromString.getTime()) ? null : fromString;
  }
  return null;
}

function mapActivityDocument(docSnapshot: QueryDocumentSnapshot<DocumentData>): ActivityDoc {
  const data = docSnapshot.data();

  const type: ActivityType = data.type === "memo" ? "memo" : "assignment";
  const status: ActivityStatus = data.status === "done" ? "done" : "pending";
  const dueDate = typeof data.dueDate === "string" ? data.dueDate : null;
  const classId =
    typeof data.classId === "string" && data.classId.trim().length > 0
      ? data.classId.trim()
      : null;

  return {
    id: docSnapshot.id,
    title: typeof data.title === "string" ? data.title : "",
    notes: typeof data.notes === "string" ? data.notes : "",
    type,
    status,
    dueDate,
    classId,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  } satisfies ActivityDoc;
}

function mapWeeklySlotDocument(docSnapshot: QueryDocumentSnapshot<DocumentData>): WeeklySlot | null {
  const data = docSnapshot.data();
  const dayOfWeek = Number.parseInt(String(data.dayOfWeek ?? ""), 10);
  if (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return null;
  }

  const periodValue = data.period;
  let period: number;

  if (typeof periodValue === "number" && Number.isFinite(periodValue)) {
    period = Math.max(0, Math.trunc(periodValue));
  } else if (typeof periodValue === "string") {
    const trimmed = periodValue.trim();
    if (trimmed.length === 0) {
      period = 0;
    } else if (/^(od|on_demand)$/i.test(trimmed)) {
      period = 0;
    } else {
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed)) {
        return null;
      }
      period = parsed <= 0 ? 0 : parsed;
    }
  } else if (periodValue == null) {
    period = 0;
  } else {
    return null;
  }

  const displayOrder =
    typeof data.displayOrder === "number" && Number.isFinite(data.displayOrder)
      ? Math.max(0, Math.trunc(data.displayOrder))
      : 0;

  return {
    id: docSnapshot.id,
    dayOfWeek,
    period,
    displayOrder,
  } satisfies WeeklySlot;
}

function mapClassDetailData(id: string, data: DocumentData | undefined): ClassDetail | null {
  if (!data) {
    return null;
  }
  const className = typeof data.className === "string" ? data.className.trim() : "";
  if (!className) {
    return null;
  }

  const typeValue = typeof data.classType === "string" ? data.classType : "in_person";
  const classType: ClassType = CLASS_TYPE_LABELS[typeValue as ClassType]
    ? (typeValue as ClassType)
    : "in_person";

  const location =
    typeof data.location === "string" && data.location.trim().length > 0
      ? data.location.trim()
      : null;

  const locationInPerson =
    typeof data.locationInPerson === "string" && data.locationInPerson.trim().length > 0
      ? data.locationInPerson.trim()
      : classType === "hybrid"
        ? location
        : null;

  const locationOnline =
    typeof data.locationOnline === "string" && data.locationOnline.trim().length > 0
      ? data.locationOnline.trim()
      : classType === "hybrid"
        ? location
        : null;

  const teacher =
    typeof data.teacher === "string" && data.teacher.trim().length > 0
      ? data.teacher.trim()
      : null;

  const fiscalYear = (() => {
    if (typeof data.fiscalYear === "number" && Number.isFinite(data.fiscalYear)) {
      return String(Math.trunc(data.fiscalYear));
    }
    if (typeof data.fiscalYear === "string" && data.fiscalYear.trim().length > 0) {
      return data.fiscalYear.trim();
    }
    return null;
  })();

  const calendarId =
    typeof data.calendarId === "string" && data.calendarId.trim().length > 0
      ? data.calendarId.trim()
      : null;

  const termNamesRaw = Array.isArray(data.termNames) ? data.termNames : [];
  const termNames = termNamesRaw
    .map((term) => (typeof term === "string" ? term.trim() : ""))
    .filter((term) => term.length > 0);
  const termIdsRaw = Array.isArray(data.termIds) ? data.termIds : [];
  const termIds = termIdsRaw
    .map((termId) => (typeof termId === "string" ? termId.trim() : ""))
    .filter((termId) => termId.length > 0);
  const termDisplayName = typeof data.termDisplayName === "string" ? data.termDisplayName : null;

  const maxAbsenceDays =
    typeof data.maxAbsenceDays === "number" && Number.isFinite(data.maxAbsenceDays)
      ? Math.max(0, Math.trunc(data.maxAbsenceDays))
      : null;

  const specialValue = typeof data.specialScheduleOption === "string" ? data.specialScheduleOption : "all";
  const specialScheduleOption: SpecialScheduleOption =
    SPECIAL_SCHEDULE_OPTION_LABELS[specialValue as SpecialScheduleOption]
      ? (specialValue as SpecialScheduleOption)
      : "all";

  const isFullyOnDemand = data.isFullyOnDemand === true;

  const credits =
    typeof data.credits === "number" && Number.isFinite(data.credits) ? data.credits : null;

  const statusValue = typeof data.creditsStatus === "string" ? data.creditsStatus : "in_progress";
  const creditsStatus: ClassDetail["creditsStatus"] =
    statusValue === "completed" || statusValue === "failed"
      ? statusValue
      : "in_progress";

  return {
    id,
    className,
    classType,
    location,
    locationInPerson,
    locationOnline,
    teacher,
    fiscalYear,
    calendarId,
    termNames,
    termIds,
    termDisplayName,
    specialScheduleOption,
    isFullyOnDemand,
    credits,
    creditsStatus,
    maxAbsenceDays,
    omitWeeklySlots: data.omitWeeklySlots === true,
  } satisfies ClassDetail;
}

function groupWeeklySlots(slots: WeeklySlot[]): string {
  if (slots.length === 0) {
    return "未設定";
  }
  const grouped = new Map<number, number[]>();
  for (const slot of slots) {
    const items = grouped.get(slot.dayOfWeek) ?? [];
    items.push(slot.period);
    grouped.set(slot.dayOfWeek, items);
  }
  const parts: string[] = [];
  const weight = (value: number) => (value <= 0 ? 999 : value);
  for (const [day, periods] of grouped) {
    const weekday = WEEKDAY_LABELS.get(day) ?? `${day}`;
    const sorted = periods.slice().sort((a, b) => weight(a) - weight(b));
    const labels = sorted.map((period) => (period <= 0 ? "オンデマンド" : `${period}限`));
    parts.push(`${weekday}曜${labels.join("・")}`);
  }
  return parts.join("、");
}

function formatTermLabel(detail: ClassDetail | null): string {
  if (!detail) {
    return "未設定";
  }
  if (detail.termDisplayName) {
    return detail.termDisplayName;
  }
  if (detail.termNames.length > 0) {
    return detail.termNames.join("、");
  }
  return "未設定";
}

function buildClassLocationLabel(detail: ClassDetail | null): string {
  if (!detail) {
    return "場所未設定";
  }
  if (detail.classType === "hybrid") {
    const inPerson = detail.locationInPerson?.trim() ?? "";
    const online = detail.locationOnline?.trim() ?? "";
    if (inPerson && online) {
      return `対面: ${inPerson} / オンライン: ${online}`;
    }
    if (inPerson) {
      return `対面: ${inPerson}`;
    }
    if (online) {
      return `オンライン: ${online}`;
    }
    return "場所未設定";
  }
  return detail.location ?? "場所未設定";
}

function formatMonthDayLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const month = value.slice(5, 7);
  const day = value.slice(8, 10);
  return `${Number.parseInt(month, 10)}/${Number.parseInt(day, 10)}`;
}

function formatDateLabel(value: Date | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDueDateLabel(value: string | null, type: ActivityType): string {
  if (type === "memo") {
    return "-";
  }
  if (!value) {
    return "未設定";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTodayId(): string {
  return new Date().toISOString().slice(0, 10);
}

function createRecordId(kind: string, id: string): string {
  return `${kind}::${id}`;
}

type UseClassActivityParams = {
  userId: string | null;
  fiscalYear: string | null;
  classId: string | null;
};

type UseClassActivityResult = ClassActivityState & {
  todayId: string;
  updateAttendanceStatus: (classDateId: string, status: AttendanceStatus) => Promise<void>;
};

function useClassActivityData({ userId, fiscalYear, classId }: UseClassActivityParams): UseClassActivityResult {
  const [classDetail, setClassDetail] = useState<ClassDetail | null>(null);
  const [weeklySlots, setWeeklySlots] = useState<WeeklySlot[]>([]);
  const [classDates, setClassDates] = useState<TimetableClassDateDoc[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummaryType | null>(null);
  const [activities, setActivities] = useState<ActivityDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [todayId, setTodayId] = useState<string>(() => getTodayId());

  useEffect(() => {
    const resolved = getTodayId();
    if (resolved !== todayId) {
      setTodayId(resolved);
    }
  }, [todayId]);

  useEffect(() => {
    if (!userId || !fiscalYear || !classId) {
      setClassDetail(null);
      setWeeklySlots([]);
      setClassDates([]);
      setAttendanceSummary(null);
      setActivities([]);
      setLoading(false);
      setError(null);
      return () => {};
    }

    setLoading(true);
    setError(null);

    let active = true;
    let pendingSources = 4;

    const markLoaded = () => {
      pendingSources -= 1;
      if (pendingSources <= 0 && active) {
        setLoading(false);
      }
    };

    const classRef = doc(
      db,
      "users",
      userId,
      "academic_years",
      fiscalYear,
      "timetable_classes",
      classId,
    );

    let classLoaded = false;
    const unsubscribeClass = onSnapshot(
      classRef,
      (snapshot) => {
        if (!active) {
          return;
        }
        const detail = mapClassDetailData(snapshot.id, snapshot.data());
        if (!detail) {
          setError("授業情報が見つかりません。削除された可能性があります。");
        }
        setClassDetail(detail);
        if (!classLoaded) {
          classLoaded = true;
          markLoaded();
        }
      },
      (err) => {
        console.error("Failed to load class detail", err);
        if (!active) {
          return;
        }
        setClassDetail(null);
        setError("授業情報の取得に失敗しました。");
        if (!classLoaded) {
          classLoaded = true;
          markLoaded();
        }
      },
    );

    const weeklySlotsRef = collection(classRef, "weekly_slots");
    let slotsLoaded = false;
    const unsubscribeSlots = onSnapshot(
      weeklySlotsRef,
      (snapshot) => {
        if (!active) {
          return;
        }
        const mapped = snapshot.docs
          .map((docSnapshot) => mapWeeklySlotDocument(docSnapshot))
          .filter((item): item is WeeklySlot => item !== null)
          .sort((a, b) => {
            if (a.displayOrder !== b.displayOrder) {
              return a.displayOrder - b.displayOrder;
            }
            if (a.dayOfWeek !== b.dayOfWeek) {
              return a.dayOfWeek - b.dayOfWeek;
            }
            return a.period - b.period;
          });
        setWeeklySlots(mapped);
        if (!slotsLoaded) {
          slotsLoaded = true;
          markLoaded();
        }
      },
      (err) => {
        console.error("Failed to load weekly slots", err);
        if (!active) {
          return;
        }
        setWeeklySlots([]);
        if (!slotsLoaded) {
          slotsLoaded = true;
          markLoaded();
        }
      },
    );

    const classDatesRef = collection(classRef, "class_dates");
    const classDatesQuery = query(classDatesRef, orderBy("classDate", "desc"));
    let datesLoaded = false;
    const unsubscribeDates = onSnapshot(
      classDatesQuery,
      (snapshot) => {
        if (!active) {
          return;
        }
        const mapped = snapshot.docs
          .map((docSnapshot) => mapTimetableClassDate(docSnapshot))
          .filter((item): item is TimetableClassDateDoc => item !== null);
        setClassDates(mapped);
        if (!datesLoaded) {
          datesLoaded = true;
          markLoaded();
        }
      },
      (err) => {
        console.error("Failed to load class dates", err);
        if (!active) {
          return;
        }
        setClassDates([]);
        if (!datesLoaded) {
          datesLoaded = true;
          markLoaded();
        }
      },
    );

    const activitiesRef = collection(db, "users", userId, "activities");
    const activitiesQuery = query(activitiesRef, orderBy("createdAt", "desc"));
    let activitiesLoaded = false;
    const unsubscribeActivities = onSnapshot(
      activitiesQuery,
      (snapshot) => {
        if (!active) {
          return;
        }
        const mapped = snapshot.docs
          .map((docSnapshot) => mapActivityDocument(docSnapshot))
          .filter((activity) => activity.classId === classId);
        setActivities(mapped);
        if (!activitiesLoaded) {
          activitiesLoaded = true;
          markLoaded();
        }
      },
      (err) => {
        console.error("Failed to load activities", err);
        if (!active) {
          return;
        }
        setActivities([]);
        if (!activitiesLoaded) {
          activitiesLoaded = true;
          markLoaded();
        }
      },
    );

    return () => {
      active = false;
      unsubscribeClass();
      unsubscribeSlots();
      unsubscribeDates();
      unsubscribeActivities();
    };
  }, [userId, fiscalYear, classId]);

  useEffect(() => {
    if (!classDetail) {
      setAttendanceSummary(null);
      return;
    }
    const summary = computeAttendanceSummary(classDates, todayId, classDetail.maxAbsenceDays);
    setAttendanceSummary(summary);
  }, [classDetail, classDates, todayId]);

  const updateAttendanceStatus = useCallback(
    async (classDateId: string, status: AttendanceStatus) => {
      if (!userId || !fiscalYear || !classId) {
        throw new Error("ユーザー情報または年度情報が不足しています。");
      }
      const classDateRef = doc(
        db,
        "users",
        userId,
        "academic_years",
        fiscalYear,
        "timetable_classes",
        classId,
        "class_dates",
        classDateId,
      );
      await updateDoc(classDateRef, {
        attendanceStatus: status ?? null,
        updatedAt: serverTimestamp(),
      });
    },
    [userId, fiscalYear, classId],
  );

  return {
    classDetail,
    weeklySlots,
    classDates,
    attendanceSummary,
    activities,
    loading,
    error,
    todayId,
    updateAttendanceStatus,
  } satisfies UseClassActivityResult;
}

function resolveActivityIcon(type: ActivityType, status: ActivityStatus) {
  if (type === "memo") {
    return { icon: faNoteSticky, className: "text-blue-600", background: "bg-blue-50" };
  }
  if (status === "done") {
    return { icon: faSquareCheck, className: "text-emerald-500", background: "bg-emerald-50" };
  }
  return { icon: faSquare, className: "text-neutral-500", background: "bg-neutral-100" };
}

function formatActivityStatusLabel(status: ActivityStatus): string {
  return status === "done" ? "完了" : "未完了";
}

function SessionRecordItem({
  record,
  onChange,
  updating,
}: {
  record: ClassSessionRecord;
  onChange: (classDateId: string, status: AttendanceStatus) => void;
  updating: boolean;
}) {
  const dateLabel = formatMonthDayLabel(record.classDate);
  const periodLabel = formatPeriodLabel(record.periods);

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            授
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900">授業 ({dateLabel})</span>
              {record.isTest ? (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-600">試験</span>
              ) : null}
              {record.isCancelled ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">休講</span>
              ) : null}
            </div>
            <span className="text-xs text-neutral-500">{periodLabel}</span>
          </div>
        </div>
        <AttendanceToggleGroup
          value={record.attendanceStatus}
          onChange={(next) => onChange(record.classDateId, next)}
          disabled={updating}
        />
      </div>
    </li>
  );
}

function ActivityRecordItem({
  record,
  className,
}: {
  record: ActivityDoc;
  className?: string;
}) {
  const { icon, className: iconClass, background } = resolveActivityIcon(record.type, record.status);
  const dueLabel = formatDueDateLabel(record.dueDate, record.type);
  const createdLabel = formatDateLabel(record.createdAt ?? record.updatedAt);
  const typeLabel = record.type === "memo" ? "授業メモ" : "課題";

  return (
    <li className={`flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm ${className ?? ""}`.trim()}>
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${background}`}>
          <FontAwesomeIcon icon={icon} className={`text-lg ${iconClass}`} aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-neutral-900">
              {record.title || "無題の項目"}
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">{typeLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            {record.type === "assignment" ? <span>期限: {dueLabel}</span> : null}
            <span>状態: {formatActivityStatusLabel(record.status)}</span>
            <span>作成日: {createdLabel}</span>
          </div>
          {record.notes ? (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-neutral-600">{record.notes}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function QuickActionButton({
  icon,
  label,
  variant = "primary",
}: {
  icon: IconDefinition;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const baseClass =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200";
  return (
    <button
      type="button"
      className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition ${baseClass}`}
    >
      <FontAwesomeIcon icon={icon} className="text-base" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function ClassActivityContent({
  classId,
  fiscalYearOverride,
}: {
  classId: string | null;
  fiscalYearOverride?: string | null;
}) {
  const { profile, initializing: authInitializing, isAuthenticated } = useAuth();
  const { settings } = useUserSettings();

  const normalizedClassId = useMemo(() => {
    if (classId == null) {
      return null;
    }
    const trimmed = classId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [classId]);

  const fiscalYear = useMemo(() => {
    const override = fiscalYearOverride?.trim();
    if (override) {
      return override;
    }
    const fromSettings = settings.calendar.fiscalYear?.trim();
    return fromSettings && fromSettings.length > 0 ? fromSettings : null;
  }, [fiscalYearOverride, settings.calendar.fiscalYear]);

  const userId = profile?.uid ?? null;

  const {
    classDetail,
    weeklySlots,
    classDates,
    attendanceSummary,
    activities,
    loading,
    error,
    todayId,
    updateAttendanceStatus,
  } = useClassActivityData({ userId, fiscalYear, classId: normalizedClassId });

  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [updatingAttendanceId, setUpdatingAttendanceId] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleAttendanceChange = useCallback(
    async (classDateId: string, status: AttendanceStatus) => {
      setAttendanceError(null);
      setUpdatingAttendanceId(classDateId);
      try {
        await updateAttendanceStatus(classDateId, status);
      } catch (err) {
        console.error("Failed to update attendance", err);
        setAttendanceError("出欠情報の更新に失敗しました。時間をおいて再度お試しください。");
      } finally {
        setUpdatingAttendanceId(null);
      }
    },
    [updateAttendanceStatus],
  );

  const combinedRecords = useMemo<CombinedRecord[]>(() => {
    const sessionRecords: ClassSessionRecord[] = classDates
      .filter((date) => date.classDate <= todayId)
      .map((date) => {
        const timestamp = new Date(`${date.classDate}T00:00:00`).getTime();
        return {
          kind: "session" as const,
          id: createRecordId("session", date.id),
          timestamp,
          classDate: date.classDate,
          classDateId: date.id,
          attendanceStatus: date.attendanceStatus,
          periods: date.periods,
          isCancelled: date.isCancelled,
          isTest: date.isTest,
        } satisfies ClassSessionRecord;
      });

    const activityRecords: ActivityRecord[] = activities.map((activity) => {
      const timestamp = activity.createdAt?.getTime() ?? activity.updatedAt?.getTime() ?? 0;
      return {
        kind: "activity" as const,
        id: createRecordId("activity", activity.id),
        timestamp,
        activity,
      } satisfies ActivityRecord;
    });

    return [...sessionRecords, ...activityRecords].sort((a, b) => b.timestamp - a.timestamp);
  }, [activities, classDates, todayId]);

  const hasAttendanceRecords = useMemo(() => {
    return classDates.some((date) => date.attendanceStatus !== null);
  }, [classDates]);

  const calendarOptions = useMemo<CalendarOption[]>(() => {
    const options = new Map<string, CalendarOption>();
    const entries = settings.calendar.entries ?? [];
    entries.forEach((entry) => {
      if (!entry) {
        return;
      }
      const fiscalYearValue =
        typeof entry.fiscalYear === "string"
          ? entry.fiscalYear.trim()
          : typeof entry.fiscalYear === "number"
            ? String(entry.fiscalYear).trim()
            : "";
      const calendarIdValue =
        typeof entry.calendarId === "string"
          ? entry.calendarId.trim()
          : typeof entry.calendarId === "number"
            ? String(entry.calendarId).trim()
            : "";
      if (!fiscalYearValue || !calendarIdValue) {
        return;
      }
      const key = `${fiscalYearValue}::${calendarIdValue}`;
      options.set(key, { fiscalYear: fiscalYearValue, calendarId: calendarIdValue });
    });
    if (classDetail?.fiscalYear && classDetail.calendarId) {
      const key = `${classDetail.fiscalYear}::${classDetail.calendarId}`;
      options.set(key, { fiscalYear: classDetail.fiscalYear, calendarId: classDetail.calendarId });
    }
    return Array.from(options.values());
  }, [classDetail?.calendarId, classDetail?.fiscalYear, settings.calendar.entries]);

  const editInitialData = useMemo<EditClassInitialData | null>(() => {
    if (!classDetail || !classDetail.fiscalYear || !classDetail.calendarId) {
      return null;
    }

    const weeklySelections: WeeklySlotSelection[] = weeklySlots.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      period: slot.period,
    }));

    const existingWeeklySlotIds = weeklySlots.map((slot) => slot.id);
    const existingClassDateIds = classDates.map((date) => date.id);

    const generatedDates = classDates.map((date) => ({
      date: date.classDate,
      periods: date.periods,
    }));

    return {
      classId: classDetail.id,
      className: classDetail.className,
      classType: classDetail.classType,
      location: classDetail.location,
      locationInPerson: classDetail.locationInPerson,
      locationOnline: classDetail.locationOnline,
      teacher: classDetail.teacher,
      credits: classDetail.credits,
      creditsStatus: classDetail.creditsStatus,
      selectedTermIds: classDetail.termIds,
      specialOption: classDetail.specialScheduleOption,
      weeklySlots: weeklySelections,
      isFullyOnDemand: classDetail.isFullyOnDemand,
      maxAbsenceDays: classDetail.maxAbsenceDays ?? 0,
      originalFiscalYear: classDetail.fiscalYear,
      calendarId: classDetail.calendarId,
      generatedClassDates: generatedDates,
      existingWeeklySlotIds,
      existingClassDateIds,
    } satisfies EditClassInitialData;
  }, [classDates, classDetail, weeklySlots]);

  const canEditClass = Boolean(editInitialData && userId);

  const absenceMessage = attendanceSummary ? buildAbsenceMessage(attendanceSummary) : null;
  const absenceRatioLabel = attendanceSummary
    ? attendanceSummary.maxAbsenceDays === null
      ? `欠席数: ${attendanceSummary.absentCount}`
      : `${attendanceSummary.absentCount}/${attendanceSummary.maxAbsenceDays}`
    : "欠席数: -";

  const termLabel = formatTermLabel(classDetail);
  const weeklyLabel = classDetail?.omitWeeklySlots ? "未設定" : groupWeeklySlots(weeklySlots);
  const classTypeLabel = classDetail ? CLASS_TYPE_LABELS[classDetail.classType] : "-";
  const classTypeIcon = classDetail ? CLASS_TYPE_ICONS[classDetail.classType] : faChalkboardTeacher;
  const classTypeIconClass = classDetail ? CLASS_TYPE_ICON_CLASS[classDetail.classType] : "text-neutral-500";
  const locationLabel = buildClassLocationLabel(classDetail);
  const teacherLabel = classDetail?.teacher ?? "-";

  const renderContent = () => {
    if (authInitializing) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-sm text-neutral-600">
          認証情報を確認しています...
        </div>
      );
    }

    if (!isAuthenticated) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-sm text-neutral-600">
          授業活動記録を表示するにはログインしてください。ユーザタブからサインインできます。
        </div>
      );
    }

    if (!classId) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-sm text-neutral-600">
          授業が指定されていません。
        </div>
      );
    }

    if (!fiscalYear) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-sm text-neutral-600">
          学事カレンダーの年度が未設定です。設定タブから年度を保存してください。
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <section className="rounded-3xl bg-blue-50 px-5 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <h1 className="truncate text-xl font-semibold text-neutral-900">{classDetail?.className ?? "授業名未設定"}</h1>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-neutral-600">
                <span className="rounded-full bg-white px-2.5 py-1 text-blue-600">開講時期</span>
                <span>{termLabel}</span>
                <span className="text-neutral-400">/</span>
                <span>{weeklyLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                <span className="flex items-center gap-2 font-medium">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-white ${classTypeIconClass}`}>
                    <FontAwesomeIcon icon={classTypeIcon} className="text-base" aria-hidden="true" />
                  </span>
                  {classTypeLabel}
                </span>
                <span className="text-neutral-400">/</span>
                <span>{locationLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-600">担当教員</span>
                <span>{teacherLabel}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!canEditClass) {
                  return;
                }
                setIsEditDialogOpen(true);
              }}
              disabled={!canEditClass}
              className="flex h-10 items-center gap-2 rounded-full border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-white"
            >
              <FontAwesomeIcon icon={faPen} className="text-sm" aria-hidden="true" />
              編集
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <QuickActionButton icon={faListCheck} label="課題作成" />
            <QuickActionButton icon={faNoteSticky} label="メモ作成" variant="secondary" />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900">出欠状況</h2>
            <span className="text-xs text-neutral-500">最新の授業までの集計</span>
          </div>
          {attendanceSummary ? (
            <AttendanceSummary
              summary={attendanceSummary}
              absenceMessage={absenceMessage}
              absenceRatioLabel={absenceRatioLabel}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-600">
              出欠情報がまだ登録されていません。
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 pb-8">
          <h2 className="text-base font-semibold text-neutral-900">これまでの活動記録</h2>
          {attendanceError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{attendanceError}</div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          ) : null}
          {loading ? (
            <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white text-sm text-neutral-600">
              読み込み中です...
            </div>
          ) : combinedRecords.length === 0 ? (
            <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white text-sm text-neutral-600">
              表示できる活動記録がまだありません。
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {combinedRecords.map((record) =>
                record.kind === "session" ? (
                  <SessionRecordItem
                    key={record.id}
                    record={record}
                    onChange={handleAttendanceChange}
                    updating={updatingAttendanceId === record.classDateId}
                  />
                ) : (
                  <ActivityRecordItem key={record.id} record={record.activity} />
                ),
              )}
            </ul>
          )}
        </section>
      </div>
    );
  };

  return (
    <div className="flex min-h-[100svh] w-full justify-center bg-neutral-100">
      <div className="mx-auto flex h-full min-h-[100svh] w-full max-w-[800px] flex-col bg-white px-4 py-6">
        {renderContent()}
      </div>
      {isEditDialogOpen && editInitialData && classDetail && classDetail.fiscalYear && classDetail.calendarId ? (
        <CreateClassDialog
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          calendarOptions={calendarOptions}
          defaultFiscalYear={classDetail.fiscalYear}
          defaultCalendarId={classDetail.calendarId}
          userId={userId}
          mode="edit"
          initialData={editInitialData}
          disableScheduleChanges={hasAttendanceRecords}
        />
      ) : null}
    </div>
  );
}

export default function ClassActivityPage() {
  const params = useParams<{ classId?: string }>();
  const searchParams = useSearchParams();

  const classIdParam = typeof params?.classId === "string" ? params.classId : null;
  const fiscalYearParam = searchParams.get("fiscalYear");

  return (
    <ClassActivityContent classId={classIdParam} fiscalYearOverride={fiscalYearParam} />
  );
}

