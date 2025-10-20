"use client";

type LongContentDemoViewProps = {
  onClose: () => void;
};

const DEMO_ITEMS = Array.from({ length: 60 }, (_, index) => index + 1);

export default function LongContentDemoView({ onClose }: LongContentDemoViewProps) {
  return (
    <div className="flex flex-1 min-h-0 w-full flex-col overflow-hidden bg-white">
      <header className="flex h-[60px] w-full items-center justify-between border-b border-neutral-200 px-5">
        <div className="text-lg font-semibold text-neutral-900">ロングスクロールデモ</div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-[96px] items-center justify-center rounded-full border border-neutral-300 bg-white text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
        >
          閉じる
        </button>
      </header>
      <div className="flex flex-1 min-h-0 w-full flex-col overflow-y-auto bg-neutral-50 px-6 py-6">
        <ul className="flex w-full flex-col gap-4">
          {DEMO_ITEMS.map((item) => (
            <li
              key={item}
              className="flex h-[120px] w-full flex-col justify-center rounded-2xl border border-neutral-200 bg-white px-5"
            >
              <p className="text-base font-semibold text-neutral-900">デモセクション {item}</p>
              <p className="mt-2 text-sm text-neutral-600">
                スクロール動作を確認するためのダミーコンテンツです。適当な文章が続きます。
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
