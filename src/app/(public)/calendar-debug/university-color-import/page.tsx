'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { University } from '@/lib/data/schema/university';
import {
  listUniversities,
  updateUniversityColors,
  type UniversityColorUpdate,
} from '@/lib/data/service/university.service';

interface CsvRow {
  universityName: string;
  colorName: string;
  colorRgb: string;
}

interface CsvParseResult {
  rows: CsvRow[];
  errors: string[];
}

interface CsvRecordsResult {
  rows: string[][];
  error?: string;
}

function parseCsvRecords(text: string): CsvRecordsResult {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  if (inQuotes) {
    return { rows: [], error: 'CSV の引用符が閉じられていません。' };
  }

  if (currentRow.length > 0 || currentValue.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return { rows };
}

function normalizeRgbString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const stripped = trimmed.replace(/^"+|"+$/g, '');
  const components = stripped
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (components.length !== 3) {
    return null;
  }

  const normalized: string[] = [];

  for (const component of components) {
    const numeric = Number.parseInt(component, 10);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    if (numeric < 0 || numeric > 255) {
      return null;
    }
    normalized.push(String(numeric));
  }

  return normalized.join(',');
}

function parseUniversityColorCsv(text: string): CsvParseResult {
  const { rows, error } = parseCsvRecords(text);
  const errors: string[] = [];

  if (error) {
    errors.push(error);
    return { rows: [], errors };
  }

  const sanitizedRows = rows
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (sanitizedRows.length === 0) {
    errors.push('CSV にデータが含まれていません。');
    return { rows: [], errors };
  }

  const header = sanitizedRows[0].map((cell) => cell.replace(/^\ufeff/, ''));
  if (header.length < 3) {
    errors.push('CSV の列数が不足しています。');
    return { rows: [], errors };
  }

  if (header[0] !== '大学名' || header[1] !== '色名' || header[2] !== 'RGB値') {
    errors.push('CSV ヘッダーが想定と異なります。');
    return { rows: [], errors };
  }

  const dataRows = sanitizedRows.slice(1);
  if (dataRows.length === 0) {
    errors.push('CSV にデータ行が存在しません。');
    return { rows: [], errors };
  }

  const parsedRows: CsvRow[] = [];

  dataRows.forEach((row, index) => {
    const lineNumber = index + 2;
    const universityName = row[0]?.trim() ?? '';
    const colorName = row[1]?.trim() ?? '';
    const rgbValue = row[2] ?? '';

    if (!universityName) {
      errors.push(`${lineNumber} 行目: 大学名が空です。`);
      return;
    }

    const normalizedRgb = normalizeRgbString(rgbValue);
    if (!normalizedRgb) {
      errors.push(`${lineNumber} 行目: RGB値が不正です。`);
      return;
    }

    parsedRows.push({ universityName, colorName, colorRgb: normalizedRgb });
  });

  if (parsedRows.length === 0 && errors.length === 0) {
    errors.push('有効なデータ行が存在しません。');
  }

  return { rows: parsedRows, errors };
}

export default function UniversityColorImportPage() {
  const [csvText, setCsvText] = useState('');
  const [universities, setUniversities] = useState<University[]>([]);
  const [isLoadingUniversities, setIsLoadingUniversities] = useState(true);
  const [universitiesError, setUniversitiesError] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [missingUniversities, setMissingUniversities] = useState<string[]>([]);
  const [updatedUniversities, setUpdatedUniversities] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    setIsLoadingUniversities(true);
    setUniversitiesError(null);

    void listUniversities()
      .then((items) => {
        setUniversities(items);
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : '大学一覧の取得に失敗しました。';
        setUniversitiesError(message);
        setUniversities([]);
      })
      .finally(() => {
        setIsLoadingUniversities(false);
      });
  }, []);

  const universityMap = useMemo(() => {
    return new Map(universities.map((item) => [item.name, item]));
  }, [universities]);

  const handleImport = useCallback(async () => {
    setParseErrors([]);
    setProcessError(null);
    setStatusMessage(null);
    setUpdatedUniversities([]);
    setMissingUniversities([]);

    if (universities.length === 0) {
      setProcessError('大学一覧を取得できていないため更新できません。');
      return;
    }

    const trimmed = csvText.trim();
    if (!trimmed) {
      setParseErrors(['CSV データを入力してください。']);
      return;
    }

    const { rows, errors } = parseUniversityColorCsv(trimmed);
    if (errors.length > 0) {
      setParseErrors(errors);
      return;
    }

    const updatesMap = new Map<string, { update: UniversityColorUpdate; name: string }>();
    const missing: string[] = [];

    rows.forEach((row) => {
      const matched = universityMap.get(row.universityName);
      if (!matched) {
        missing.push(row.universityName);
        return;
      }

      updatesMap.set(matched.id, {
        update: { universityId: matched.id, colorRgb: row.colorRgb },
        name: matched.name,
      });
    });

    const uniqueMissing = Array.from(new Set(missing));
    setMissingUniversities(uniqueMissing);

    if (updatesMap.size === 0) {
      setProcessError('更新対象の大学が見つかりませんでした。');
      return;
    }

    setIsImporting(true);
    try {
      const updates = Array.from(updatesMap.values()).map((item) => item.update);
      await updateUniversityColors(updates);

      const updatedNames = Array.from(updatesMap.values()).map((item) => item.name);
      setUpdatedUniversities(updatedNames);
      setStatusMessage(`${updates.length} 件の大学カラーを更新しました。`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '大学カラーの更新に失敗しました。';
      setProcessError(message);
    } finally {
      setIsImporting(false);
    }
  }, [csvText, universityMap, universities.length, updateUniversityColors]);

  return (
    <main className="min-h-screen w-full bg-neutral-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
        <header className="flex w-full flex-col gap-2">
          <h1 className="text-2xl font-semibold text-neutral-900">大学カラー取り込み</h1>
          <p className="text-sm text-neutral-600">
            指定フォーマットの CSV を貼り付けて、大学ドキュメントの colorRgb フィールドを一括更新します。
          </p>
          {isLoadingUniversities ? (
            <p className="text-xs text-neutral-500">大学一覧を読み込み中です…</p>
          ) : (
            <p className="text-xs text-neutral-500">
              取得済み大学数: {universities.length.toLocaleString()} 校
            </p>
          )}
          {universitiesError ? (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {universitiesError}
            </p>
          ) : null}
        </header>

        <section className="flex w-full flex-col gap-4 rounded border border-neutral-200 bg-white p-4">
          <label className="flex w-full flex-col gap-2 text-sm font-medium text-neutral-700">
            CSV データ
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder={`大学名,色名,RGB値\n愛国学園大学,薄桃色、黄色,"245,178,178"`}
              className="h-64 w-full resize-none rounded border border-neutral-300 px-3 py-2 text-base"
            />
          </label>

          <div className="flex w-full flex-col gap-2 rounded border border-neutral-100 bg-neutral-50 p-3 text-xs text-neutral-600">
            <p className="font-semibold text-neutral-700">CSV フォーマット</p>
            <p>1 行目をヘッダーとして、以下の列順で入力してください。</p>
            <ul className="list-disc pl-5">
              <li>大学名</li>
              <li>色名</li>
              <li>RGB値 (例: "245,178,178")</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting || isLoadingUniversities}
            className="h-11 w-full rounded bg-neutral-900 px-4 text-sm font-semibold text-white disabled:bg-neutral-400"
          >
            {isImporting ? '更新中…' : 'colorRgb を更新'}
          </button>

          {parseErrors.length > 0 ? (
            <div className="flex w-full flex-col gap-1 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-semibold">CSV の解析中にエラーが発生しました。</p>
              <ul className="list-disc pl-5">
                {parseErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {missingUniversities.length > 0 ? (
            <div className="flex w-full flex-col gap-1 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-semibold">以下の大学が存在しませんでした。</p>
              <ul className="list-disc pl-5">
                {missingUniversities.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {processError ? (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {processError}
            </p>
          ) : null}

          {statusMessage ? (
            <div className="flex w-full flex-col gap-1 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
              <p className="font-semibold">更新完了</p>
              <p>{statusMessage}</p>
            </div>
          ) : null}
        </section>

        {updatedUniversities.length > 0 ? (
          <section className="flex w-full flex-col gap-2 rounded border border-neutral-200 bg-white p-4">
            <h2 className="text-base font-semibold text-neutral-900">更新された大学一覧</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
              {updatedUniversities.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
