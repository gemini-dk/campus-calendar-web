'use client';

import type { AttendanceSummary as AttendanceSummaryType } from '@/app/mobile/types';

type AttendanceSummaryProps = {
  summary: AttendanceSummaryType;
  absenceMessage: string | null;
  absenceRatioLabel: string;
  className?: string;
};

export default function AttendanceSummary({
  summary,
  absenceMessage,
  absenceRatioLabel,
  className,
}: AttendanceSummaryProps) {
  const total = Math.max(summary.totalCount, 1);
  const toPercent = (value: number) => Math.max(0, Math.min(100, (value / total) * 100));

  const segments = {
    present: toPercent(summary.presentCount),
    late: toPercent(summary.lateCount),
    unrecorded: toPercent(summary.unrecordedCount),
    absent: toPercent(summary.absentCount),
  };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold text-emerald-600">{summary.presentCount}</span>
          <span className="text-sm text-neutral-600">
            /{summary.totalCount}{' '}
            <span className="text-neutral-500">
              (遅刻: {summary.lateCount}, 未入力: {summary.unrecordedCount})
            </span>
          </span>
        </div>
        <div className="flex flex-col items-end text-red-500">
          <span className="text-sm font-semibold">{absenceRatioLabel}</span>
          {absenceMessage ? <span className="text-xs font-medium">{absenceMessage}</span> : null}
        </div>
      </div>
      <div className="relative flex h-3 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className="flex h-full w-full">
          <span style={{ width: `${segments.present}%` }} className="h-full bg-emerald-500" />
          <span style={{ width: `${segments.late}%` }} className="h-full bg-orange-400" />
          <span style={{ width: `${segments.unrecorded}%` }} className="h-full bg-neutral-400" />
        </div>
        <span
          style={{ width: `${segments.absent}%` }}
          className="absolute right-0 top-0 h-full bg-red-500"
        />
      </div>
    </div>
  );
}
