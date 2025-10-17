'use client';

import { useMemo, useState } from 'react';

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClock,
  faFlagCheckered,
  faListCheck,
  faNoteSticky,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { faCircleCheck } from '@fortawesome/free-regular-svg-icons';

type ViewMode = 'todo' | 'memo';

type TodoItem = {
  id: string;
  title: string;
  category: string;
  due: string;
  status: 'done' | 'in-progress';
  description: string;
};

type MemoItem = {
  id: string;
  title: string;
  updatedAt: string;
  body: string;
  tags: string[];
};

const TODO_ITEMS: TodoItem[] = [
  {
    id: 'todo-1',
    title: 'ゼミ発表スライドの最終チェック',
    category: '研究',
    due: '今日 18:00 まで',
    status: 'in-progress',
    description: '発表者ノートを含めた最終確認と練習時間の調整。',
  },
  {
    id: 'todo-2',
    title: '教育心理学レポート提出',
    category: '授業',
    due: '明日 12:00 締切',
    status: 'in-progress',
    description: '引用箇所の最終確認とアップロード手順の再チェック。',
  },
  {
    id: 'todo-3',
    title: '就活イベント申し込み',
    category: 'キャリア',
    due: '今週末まで',
    status: 'done',
    description: 'オンライン企業説明会（商社）の参加登録。',
  },
];

const MEMO_ITEMS: MemoItem[] = [
  {
    id: 'memo-1',
    title: '卒論テーマ案ブレスト',
    updatedAt: '12/14 更新',
    body: '・研究対象は地域コミュニティの防災活動\n・先行研究の整理を冬休み中に実施\n・教授との面談日程を 12/22 に調整する',
    tags: ['研究', 'TODO案'],
  },
  {
    id: 'memo-2',
    title: '買い出しリスト',
    updatedAt: '12/12 更新',
    body: '・プロジェクター用HDMIケーブル\n・A4 クリアファイル\n・ゼミ懇親会用お菓子（予算 1,500 円）',
    tags: ['生活', 'ゼミ'],
  },
  {
    id: 'memo-3',
    title: '資格勉強のチェックポイント',
    updatedAt: '12/10 更新',
    body: '・公式テキストの章末問題を 1 章ずつ進める\n・週末に模擬試験を 1 回実施\n・Discord 勉強会は木曜の 21:00 から',
    tags: ['学習計画'],
  },
];

function ViewToggleButton({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: IconDefinition;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
        isActive
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
          : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
      }`}
      aria-pressed={isActive}
    >
      <FontAwesomeIcon icon={icon} fontSize={18} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function TodoList() {
  const summary = useMemo(() => {
    const total = TODO_ITEMS.length;
    const completed = TODO_ITEMS.filter((item) => item.status === 'done').length;
    const remaining = total - completed;
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

    return { total, completed, remaining, completionRate };
  }, []);

  return (
    <div className="flex w-full flex-col gap-5">
      <section className="flex w-full flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-600">今日の進捗</p>
            <h2 className="mt-2 text-lg font-semibold text-neutral-900">タスク管理のサマリー</h2>
            <p className="mt-1 text-sm text-neutral-500">
              完了 {summary.completed} 件 / 残り {summary.remaining} 件
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
            {summary.completionRate}%
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${summary.completionRate}%` }}
            aria-hidden="true"
          />
        </div>
      </section>

      {TODO_ITEMS.map((item) => {
        const isDone = item.status === 'done';
        return (
          <article
            key={item.id}
            className="flex w-full flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-1 flex-col">
                <h3 className="text-base font-semibold text-neutral-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.description}</p>
              </div>
              <span className="flex h-8 items-center rounded-full bg-neutral-100 px-3 text-xs font-semibold text-neutral-600">
                {item.category}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500">
              <div className="flex items-center gap-2 text-neutral-600">
                <FontAwesomeIcon icon={faClock} className="text-blue-500" />
                <span>{item.due}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-600">
                <FontAwesomeIcon
                  icon={isDone ? faCircleCheck : faFlagCheckered}
                  className={isDone ? 'text-emerald-500' : 'text-orange-500'}
                />
                <span>{isDone ? '完了済み' : '進行中'}</span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MemoList() {
  return (
    <div className="flex w-full flex-col gap-5">
      <section className="flex w-full flex-col gap-2 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">メモ一覧</h2>
        <p className="text-sm text-neutral-500">
          発想メモや買い出しリストなど、自由に書き留めたメモをここから見返せます。
        </p>
      </section>

      {MEMO_ITEMS.map((memo) => (
        <article
          key={memo.id}
          className="flex w-full flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <h3 className="text-base font-semibold text-neutral-900">{memo.title}</h3>
              <span className="mt-1 text-xs font-semibold text-blue-600">{memo.updatedAt}</span>
            </div>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">{memo.body}</p>
          <div className="flex flex-wrap gap-2">
            {memo.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                #{tag}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export default function TodoTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('todo');

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="flex h-[88px] w-full flex-col justify-center gap-2 px-6">
        <h1 className="text-xl font-semibold text-neutral-900">Todo とメモ</h1>
        <p className="text-sm text-neutral-500">やることの整理とメモの管理をひとつの画面で行えます。</p>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-28">
        {viewMode === 'todo' ? <TodoList /> : <MemoList />}
      </div>

      <div className="pointer-events-none absolute bottom-6 right-6 flex items-center gap-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-blue-100 bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
          <ViewToggleButton
            icon={faListCheck}
            label="Todo ビュー"
            isActive={viewMode === 'todo'}
            onClick={() => setViewMode('todo')}
          />
          <ViewToggleButton
            icon={faNoteSticky}
            label="メモ ビュー"
            isActive={viewMode === 'memo'}
            onClick={() => setViewMode('memo')}
          />
        </div>
        <button
          type="button"
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-white shadow-xl shadow-blue-500/30"
          aria-label="新規作成"
        >
          <FontAwesomeIcon icon={faPlus} fontSize={22} />
        </button>
      </div>
    </div>
  );
}
