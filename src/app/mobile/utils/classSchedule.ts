import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

import type {
  AttendanceStatus,
  AttendanceSummary,
  DeliveryType,
} from '@/app/mobile/types';

export type ClassType = 'in_person' | 'online' | 'hybrid' | 'on_demand';

export type TimetableClassDateDoc = {
  id: string;
  classDate: string;
  periods: (number | 'OD')[];
  attendanceStatus: AttendanceStatus;
  isTest: boolean;
  isExcludedFromSummary: boolean;
  isCancelled: boolean;
  deliveryType: DeliveryType;
  hasUserModifications: boolean;
};

const ATTENDANCE_STATUS_VALUES = new Set(['present', 'late', 'absent']);
const DELIVERY_TYPE_VALUES = new Set(['unknown', 'in_person', 'remote']);

export function mapTimetableClassDate(
  docSnapshot: QueryDocumentSnapshot<DocumentData>,
): TimetableClassDateDoc | null {
  const data = docSnapshot.data();
  const classDate = typeof data.classDate === 'string' ? data.classDate : null;
  if (!classDate) {
    return null;
  }

  const periodsRaw = Array.isArray(data.periods) ? data.periods : [];
  const periods = periodsRaw
    .map((period) => {
      if (period === 'OD') {
        return 'OD';
      }
      if (typeof period === 'number' && Number.isFinite(period) && period > 0) {
        return Math.trunc(period);
      }
      return null;
    })
    .filter((period): period is number | 'OD' => period === 'OD' || period !== null);

  const attendanceStatus =
    typeof data.attendanceStatus === 'string' && ATTENDANCE_STATUS_VALUES.has(data.attendanceStatus)
      ? (data.attendanceStatus as Exclude<AttendanceStatus, null>)
      : null;

  const deliveryType =
    typeof data.deliveryType === 'string' && DELIVERY_TYPE_VALUES.has(data.deliveryType)
      ? (data.deliveryType as DeliveryType)
      : 'unknown';

  return {
    id: docSnapshot.id,
    classDate,
    periods,
    attendanceStatus,
    isTest: data.isTest === true,
    isExcludedFromSummary: data.isExcludedFromSummary === true,
    isCancelled: data.isCancelled === true,
    deliveryType,
    hasUserModifications: data.hasUserModifications === true,
  } satisfies TimetableClassDateDoc;
}

export function computeAttendanceSummary(
  items: TimetableClassDateDoc[],
  todayId: string,
  maxAbsenceDays: number | null,
): AttendanceSummary {
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let unrecordedCount = 0;
  let totalCount = 0;

  for (const item of items) {
    if (item.isExcludedFromSummary || item.isCancelled) {
      continue;
    }

    totalCount += 1;

    switch (item.attendanceStatus) {
      case 'present':
        presentCount += 1;
        break;
      case 'late':
        lateCount += 1;
        break;
      case 'absent':
        absentCount += 1;
        break;
      default:
        if (item.classDate <= todayId) {
          unrecordedCount += 1;
        }
        break;
    }
  }

  return {
    presentCount,
    lateCount,
    absentCount,
    unrecordedCount,
    totalCount,
    maxAbsenceDays,
  } satisfies AttendanceSummary;
}

export function buildAbsenceMessage(summary: AttendanceSummary): string | null {
  if (summary.maxAbsenceDays === null) {
    return null;
  }
  if (summary.maxAbsenceDays <= 0) {
    return '欠席可能日数は設定されていません。';
  }
  const remaining = summary.maxAbsenceDays - summary.absentCount;
  if (remaining > 1) {
    return `あと${remaining}日欠席可能です。`;
  }
  if (remaining === 1) {
    return 'あと1日欠席可能です。';
  }
  if (remaining === 0) {
    return '欠席可能日数は残り0日です。';
  }
  return `欠席可能日数を${Math.abs(remaining)}日超過しています。`;
}

export function formatPeriodLabel(periods: (number | 'OD')[]): string {
  if (periods.length === 0) {
    return '時限未設定';
  }
  const numeric = periods
    .filter((period): period is number => typeof period === 'number')
    .sort((a, b) => a - b);
  const hasOnDemand = periods.includes('OD');
  if (numeric.length === 0 && hasOnDemand) {
    return 'オンデマンド';
  }
  if (numeric.length > 0) {
    const base = `${numeric.join(',')}限`;
    return hasOnDemand ? `${base} / オンデマンド` : base;
  }
  return '時限未設定';
}
