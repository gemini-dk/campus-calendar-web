"use client";

import { useEffect, useState } from 'react';

import Link from 'next/link';

import { getCalendarTerms } from '@/lib/data/service/calendar.service';
import { useUserSettings } from '@/lib/settings/UserSettingsProvider';

type TermCandidate = {
  id: string;
  name: string;
};

export default function BulkImportPage() {
  const { settings, initialized } = useUserSettings();
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [termCandidates, setTermCandidates] = useState<TermCandidate[]>([]);
  const [termLoadState, setTermLoadState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!initialized) {
      return;
    }

    const fiscalYear = settings.calendar.fiscalYear;
    const calendarId = settings.calendar.calendarId;
    if (!fiscalYear || !calendarId) {
      setTermCandidates([]);
      return;
    }

    setTermLoadState('loading');
    getCalendarTerms(fiscalYear, calendarId)
      .then((terms) => {
        const options = terms.map((term) => ({ id: term.id, name: term.name }));
        setTermCandidates(options);
        setTermLoadState('idle');
      })
      .catch((loadError) => {
        console.error('学期データの取得に失敗しました', loadError);
        setTermCandidates([]);
        setTermLoadState('error');
      });
  }, [initialized, settings.calendar.calendarId, settings.calendar.fiscalYear]);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/class-bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, termCandidates }),
      });

      const data = (await response.json()) as { data?: unknown; error?: string };

      if (!response.ok) {
        setError(data.error ?? '変換に失敗しました。');
        return;
      }

      setResult(JSON.stringify(data.data, null, 2));
    } catch (importError) {
      console.error('授業一括取り込みの実行に失敗しました', importError);
      setError('変換に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-neutral-50">
      <header className="flex h-14 w-full items-center border-b border-neutral-200 bg-white px-4">
        <div className="flex w-full items-center justify-between">
          <Link
            href="/mobile"
            className="flex h-10 items-center rounded px-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
          >
            戻る
          </Link>
          <h1 className="text-base font-semibold text-neutral-900">授業一括取り込み</h1>
          <span className="w-12" aria-hidden="true" />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 pb-8">
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-6">
          <p className="text-sm text-neutral-700">受講している授業を一覧形式で入力してください。</p>
          <p className="text-xs text-neutral-500">
            {termLoadState === 'loading'
              ? '学期情報を読み込み中です...'
              : termCandidates.length > 0
                ? `学期候補: ${termCandidates.map((term) => term.name).join(' / ')}`
                : '学期候補が見つかりません。時間割設定を確認してください。'}
          </p>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="h-56 w-full rounded border border-neutral-300 bg-white p-3 text-sm text-neutral-800 shadow-sm focus:border-blue-400 focus:outline-none"
            placeholder="例: 月曜1限 経済学入門 教室A 2単位..."
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={loading}
            className="flex h-11 w-full items-center justify-center rounded bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {loading ? '変換中...' : '取り込み'}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {result ? (
            <div className="flex w-full flex-col gap-2 rounded border border-neutral-200 bg-white p-3 shadow-sm">
              <p className="text-sm font-semibold text-neutral-900">変換結果</p>
              <pre className="w-full whitespace-pre-wrap text-xs text-neutral-800">{result}</pre>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
