export type AttendanceStatus = 'present' | 'late' | 'absent' | null;

export type DeliveryType = 'unknown' | 'in_person' | 'remote';

export type AttendanceSummary = {
  presentCount: number;
  absentCount: number;
  lateCount: number;
  unrecordedCount: number;
  totalCount: number;
  maxAbsenceDays: number | null;
};
