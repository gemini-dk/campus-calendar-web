'use client';

import { useEffect } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

const CONTENT_PARAGRAPHS = [
  '大学生活を円滑に進めるためのヒントをまとめたダミーテキストです。予定表の使い方や、課題を見逃さないためのコツなどを紹介しています。',
  'キャンパス内のイベント情報を仮で掲載しています。興味のあるものは早めにカレンダーに登録しておきましょう。',
  '学習を進める際には、授業ごとの目標を明確にしておくと、振り返りがしやすくなります。メモ欄などをうまく活用してください。',
  '長いコンテンツでもスクロールしやすいように、セクションごとに余白を設けています。デザインの参考用テキストです。',
];

type ScrollDemoScreenProps = {
  open: boolean;
  onClose: () => void;
};

export default function ScrollDemoScreen({ open, onClose }: ScrollDemoScreenProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex h-[100svh] w-full flex-1 min-h-0 flex-col bg-white">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-neutral-500">スクロール検証</p>
          <h1 className="mt-1 text-lg font-semibold text-neutral-900">固定ヘッダ＋スクロール</h1>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="画面を閉じる"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-100"
        >
          <FontAwesomeIcon icon={faXmark} fontSize={20} />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-50 px-5 pb-20 pt-6">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 24 }).map((_, index) => (
            <section
              key={index}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-base font-semibold text-neutral-900">
                セクション {index + 1}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-700">
                {CONTENT_PARAGRAPHS[index % CONTENT_PARAGRAPHS.length]}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
