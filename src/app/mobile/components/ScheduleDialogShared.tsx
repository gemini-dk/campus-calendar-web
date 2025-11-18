import { useMemo } from 'react';

export type PeriodValue = number | 'OD';

export function startOfMonth(dateId: string): Date {
  const parsed = new Date(`${dateId}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

export function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(date);
}

function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type CalendarCell = {
  dateId: string;
  label: string;
  inCurrentMonth: boolean;
};

export function buildCalendarCells(monthDate: Date): CalendarCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells: CalendarCell[] = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayOffset = index - firstWeekday + 1;
    const cellDate = new Date(year, month, dayOffset);
    cells.push({
      dateId: formatDateId(cellDate),
      label: String(cellDate.getDate()),
      inCurrentMonth: cellDate.getMonth() === month,
    });
  }

  return cells;
}

export function sortPeriods(values: PeriodValue[]): PeriodValue[] {
  const weight = (value: PeriodValue) => (value === 'OD' ? 999 : value);
  return values
    .slice()
    .sort((a, b) => weight(a) - weight(b));
}

type PeriodRowProps = {
  periods: number[];
  selectedPeriods: PeriodValue[];
  onToggle: (value: PeriodValue) => void;
};

export function PeriodRow({ periods, selectedPeriods, onToggle }: PeriodRowProps) {
  const columnCount = useMemo(() => {
    if (periods.length === 0) {
      return 1;
    }
    return Math.min(Math.max(periods.length, 1), 6);
  }, [periods.length]);

  if (periods.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
      {periods.map((period) => {
        const selected = selectedPeriods.includes(period);
        return (
          <button
            type="button"
            key={period}
            onClick={() => onToggle(period)}
            className={`flex h-10 items-center justify-center rounded-full border text-sm font-semibold transition ${
              selected
                ? 'border-blue-500 bg-blue-600 text-white'
                : 'border-neutral-200 bg-white text-neutral-700 hover:border-blue-300'
            }`}
          >
            {period}限
          </button>
        );
      })}
    </div>
  );
}
