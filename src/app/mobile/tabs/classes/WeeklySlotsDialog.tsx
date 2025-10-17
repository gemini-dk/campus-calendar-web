"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import type { WeeklySlotSelection } from "@/lib/data/service/class.service";

type WeeklySlotsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  initialSlots: WeeklySlotSelection[];
  onApply: (slots: WeeklySlotSelection[]) => void;
};

const WEEKDAYS = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
] as const;

const PERIODS = [
  { value: 1, label: "1限" },
  { value: 2, label: "2限" },
  { value: 3, label: "3限" },
  { value: 4, label: "4限" },
  { value: 5, label: "5限" },
  { value: 6, label: "6限" },
  { value: 0, label: "オンデマンド" },
] as const;

export function WeeklySlotsDialog({ isOpen, onClose, initialSlots, onApply }: WeeklySlotsDialogProps) {
  const [selectedSlots, setSelectedSlots] = useState<WeeklySlotSelection[]>(initialSlots);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSelectedSlots(initialSlots);
  }, [initialSlots, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleToggleSlot = (slot: WeeklySlotSelection) => {
    setSelectedSlots((prev) => {
      const key = `${slot.dayOfWeek}-${slot.period}`;
      const exists = prev.some((item) => `${item.dayOfWeek}-${item.period}` === key);
      if (exists) {
        return prev.filter((item) => `${item.dayOfWeek}-${item.period}` !== key);
      }
      return [...prev, slot];
    });
  };

  const handleApply = () => {
    onApply(selectedSlots);
  };

  const summary = useMemo(() => {
    const weekdayMap = new Map<number, string>(WEEKDAYS.map((item) => [item.value, item.label]));
    return selectedSlots
      .map((slot) => {
        const weekday = weekdayMap.get(slot.dayOfWeek) ?? `${slot.dayOfWeek}`;
        return slot.period === 0 ? `${weekday}オンデマンド` : `${weekday}${slot.period}`;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [selectedSlots]);

  return (
    <div className="fixed inset-0 z-[60] flex h-full w-full items-center justify-center bg-black/50 px-4 py-6">
      <div className="flex h-full max-h-[560px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex h-16 w-full items-center justify-between border-b border-neutral-200 px-5">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">曜日・時限設定</h2>
            <p className="text-xs text-neutral-500">曜日と時限を選択してください。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
          >
            閉じる
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-50 px-5 py-6">
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-neutral-200 bg-white">
              <div className="grid grid-cols-7 gap-2 p-3 text-xs text-neutral-700">
                <div className="flex items-center justify-center font-semibold text-neutral-500">
                  時限/曜日
                </div>
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday.value} className="flex items-center justify-center font-semibold">
                    {weekday.label}
                  </div>
                ))}
                {PERIODS.map((period) => (
                  <Fragment key={period.value}>
                    <div className="flex items-center justify-center rounded border border-neutral-200 bg-white px-2 py-2 font-semibold text-neutral-700">
                      {period.label}
                    </div>
                    {WEEKDAYS.map((weekday) => {
                      const key = `${weekday.value}-${period.value}`;
                      const isSelected = selectedSlots.some(
                        (slot) => `${slot.dayOfWeek}-${slot.period}` === key,
                      );
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            handleToggleSlot({ dayOfWeek: weekday.value, period: period.value })
                          }
                          className={`flex h-10 w-full items-center justify-center rounded border text-sm transition ${
                            isSelected
                              ? "border-blue-500 bg-blue-100 text-blue-700"
                              : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                          }`}
                        >
                          {isSelected ? "選択中" : "-"}
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-600">
              {summary.length > 0 ? `選択中: ${summary.join("、")}` : "選択された曜日・時限はありません。"}
            </div>
          </div>
        </div>
        <footer className="flex h-16 w-full items-center justify-end gap-3 border-t border-neutral-200 bg-white px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            適用する
          </button>
        </footer>
      </div>
    </div>
  );
}

export default WeeklySlotsDialog;
