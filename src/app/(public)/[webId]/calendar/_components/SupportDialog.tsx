"use client";

import { useMemo, useState, type FormEvent } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import type { CalendarDay, CalendarTerm } from "@/lib/data/schema/calendar";
import type { UniversityCalendar } from "@/lib/data/schema/university";
import { db } from "@/lib/firebase/firestore";

type PrefetchedUniversityCalendar = UniversityCalendar & {
  calendarDays: CalendarDay[];
  calendarTerms: CalendarTerm[];
};

export type SupportDialogType = "report" | "request" | "advertisement";

type SupportDialogProps = {
  type: SupportDialogType;
  onClose: () => void;
  activeFiscalYear: string;
  universityName: string;
  webId: string;
  calendar: PrefetchedUniversityCalendar | null;
};

type SubmissionState = "idle" | "submitting" | "success" | "error";

type FirestorePayload = {
  date: ReturnType<typeof serverTimestamp>;
  type: "間違い報告" | "カレンダー追加依頼" | "広告枠の募集";
  fromEmail: string | null;
  fromName: string | null;
  content: string;
  info: string;
};

const SUPPORT_TYPE_LABEL: Record<SupportDialogType, string> = {
  report: "間違い報告",
  request: "カレンダー追加依頼",
  advertisement: "広告枠の募集",
};

const SUPPORT_TYPE_DESCRIPTION: Record<SupportDialogType, string> = {
  report: "誤りがある場合は指摘ください。",
  request: "現在対応できていないカレンダーがあれば教えてください。",
  advertisement: "大学のインカレ団体の紹介などを掲載しませんか？お気軽にご連絡ください。",
};

function buildCalendarInfo(
  universityName: string,
  fiscalYear: string,
  calendar: PrefetchedUniversityCalendar | null,
  webId: string,
): string {
  const base = `大学: ${universityName}\n年度: ${fiscalYear}\nWebID: ${webId}`;
  if (!calendar) {
    return `${base}\nカレンダー: 未選択`;
  }
  return `${base}\nカレンダー: ${calendar.name}\nカレンダーID: ${calendar.calendarId}`;
}

function buildRequestInfo(
  universityName: string,
  fiscalYear: string,
  webId: string,
): string {
  return `大学: ${universityName}\n年度: ${fiscalYear}\nWebID: ${webId}`;
}

function buildAdvertisementInfo(
  universityName: string,
  fiscalYear: string,
  calendar: PrefetchedUniversityCalendar | null,
  webId: string,
): string {
  const advertisementUniversity = universityName.trim().length > 0 ? universityName : "全大学横断";
  const base = `広告枠問い合わせ\n大学: ${advertisementUniversity}\n年度: ${fiscalYear}\nWebID: ${webId}`;
  if (!calendar) {
    return `${base}\n表示中カレンダー: 未選択`;
  }
  return `${base}\n表示中カレンダー: ${calendar.name}\nカレンダーID: ${calendar.calendarId}`;
}

export default function SupportDialog({
  type,
  onClose,
  activeFiscalYear,
  universityName,
  webId,
  calendar,
}: SupportDialogProps) {
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [calendarCondition, setCalendarCondition] = useState("");
  const [advertisementOrganization, setAdvertisementOrganization] = useState("");
  const [advertisementMessage, setAdvertisementMessage] = useState("");

  const typeLabel = SUPPORT_TYPE_LABEL[type];
  const typeDescription = SUPPORT_TYPE_DESCRIPTION[type];

  const info = useMemo(() => {
    if (type === "report") {
      return buildCalendarInfo(universityName, activeFiscalYear, calendar, webId);
    }
    if (type === "request") {
      return buildRequestInfo(universityName, activeFiscalYear, webId);
    }
    return buildAdvertisementInfo(universityName, activeFiscalYear, calendar, webId);
  }, [type, universityName, activeFiscalYear, calendar, webId]);

  const submitButtonLabel = submissionState === "submitting" ? "送信中..." : "送信する";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionState === "submitting") {
      return;
    }

    setSubmissionState("submitting");
    setErrorMessage(null);

    try {
      let payloadContent = content.trim();
      let payloadEmail: string | null = email.trim().length > 0 ? email.trim() : null;
      let payloadName: string | null = name.trim().length > 0 ? name.trim() : null;
      if (type === "request") {
        const urlText = calendarUrl.trim().length > 0 ? calendarUrl.trim() : "未入力";
        const conditionText = calendarCondition.trim().length > 0 ? calendarCondition.trim() : "未入力";
        payloadContent = `カレンダーページURL: ${urlText}\n適用条件: ${conditionText}`;
      } else if (type === "advertisement") {
        const organizationText =
          advertisementOrganization.trim().length > 0 ? advertisementOrganization.trim() : "未入力";
        const messageText = advertisementMessage.trim().length > 0 ? advertisementMessage.trim() : "未入力";
        const advertisementUniversity = universityName.trim().length > 0 ? universityName.trim() : "全大学横断";
        payloadContent = `大学名: ${advertisementUniversity}\n団体名: ${organizationText}\n追加情報: ${messageText}`;
        payloadEmail = email.trim();
        payloadName = name.trim();
      }

      const payload: FirestorePayload = {
        date: serverTimestamp(),
        type: typeLabel as FirestorePayload["type"],
        fromEmail: payloadEmail,
        fromName: payloadName,
        content: payloadContent,
        info,
      };

      await addDoc(collection(db, "support"), payload);

      setSubmissionState("success");
    } catch (err) {
      console.error("Failed to submit support request", err);
      setErrorMessage("送信に失敗しました。時間をおいて再度お試しください。");
      setSubmissionState("error");
    }
  };

  const isSubmitting = submissionState === "submitting";
  const isSuccess = submissionState === "success";

  return (
    <div className="fixed inset-0 z-50 flex h-[100svh] w-full items-center justify-center px-4" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/40"
        aria-label="閉じる"
        disabled={isSubmitting}
      />
      <div className="relative z-10 flex h-auto w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex h-14 w-full items-center justify-between border-b border-neutral-200 px-5">
          <h2 className="text-base font-semibold text-neutral-900">{typeLabel}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-sm text-neutral-700 transition hover:bg-neutral-100"
            aria-label="閉じる"
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>
        <div className="flex max-h-[80vh] w-full flex-col overflow-y-auto">
          <form className="flex w-full flex-col gap-4 px-5 py-5" onSubmit={handleSubmit}>
            <div className="flex w-full flex-col gap-2">
              <div className="flex w-full flex-col gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                <span>大学: {universityName}</span>
                <span>年度: {activeFiscalYear}</span>
                {type !== "request" ? (
                  calendar ? <span>カレンダー: {calendar.name}</span> : <span>カレンダー: 未選択</span>
                ) : null}
              </div>
              <p className="text-sm text-neutral-600">{typeDescription}</p>
            </div>

            {type === "report" ? (
              <div className="flex w-full flex-col gap-2">
                <label className="text-sm font-semibold text-neutral-800" htmlFor="support-report-content">
                  内容
                </label>
                <textarea
                  id="support-report-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="h-36 w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="指摘内容を入力してください"
                  required
                />
              </div>
            ) : null}

            {type === "request" ? (
              <div className="flex w-full flex-col gap-4">
                <div className="flex w-full flex-col gap-2">
                  <label className="text-sm font-semibold text-neutral-800" htmlFor="support-request-url">
                    カレンダーページ（URL）
                  </label>
                  <input
                    id="support-request-url"
                    type="url"
                    value={calendarUrl}
                    onChange={(event) => setCalendarUrl(event.target.value)}
                    className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="https://"
                    required
                  />
                </div>
                <div className="flex w-full flex-col gap-2">
                  <label className="text-sm font-semibold text-neutral-800" htmlFor="support-request-condition">
                    適用条件
                  </label>
                  <textarea
                    id="support-request-condition"
                    value={calendarCondition}
                    onChange={(event) => setCalendarCondition(event.target.value)}
                    className="h-32 w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="学部やキャンパスなど、対象が限定される場合にお知らせください"
                    required
                  />
                </div>
              </div>
            ) : null}

            {type === "advertisement" ? (
              <div className="flex w-full flex-col gap-4">
                <div className="flex w-full flex-col gap-2">
                  <label className="text-sm font-semibold text-neutral-800" htmlFor="support-advertisement-organization">
                    団体名など宣伝したい対象
                  </label>
                  <input
                    id="support-advertisement-organization"
                    type="text"
                    value={advertisementOrganization}
                    onChange={(event) => setAdvertisementOrganization(event.target.value)}
                    className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="例: ○○サークル"
                    required
                  />
                </div>
                <div className="flex w-full flex-col gap-2">
                  <label className="text-sm font-semibold text-neutral-800" htmlFor="support-advertisement-message">
                    掲載したい内容やURL
                  </label>
                  <textarea
                    id="support-advertisement-message"
                    value={advertisementMessage}
                    onChange={(event) => setAdvertisementMessage(event.target.value)}
                    className="h-32 w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="任意で詳しい情報をご記入ください"
                  />
                </div>
              </div>
            ) : null}

            <div className="flex w-full flex-col gap-4">
              <div className="flex w-full flex-col gap-2">
                <label className="text-sm font-semibold text-neutral-800" htmlFor="support-email">
                  メールアドレス
                </label>
                <input
                  id="support-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="example@example.com"
                  required={type === "advertisement"}
                />
              </div>
              <div className="flex w-full flex-col gap-2">
                <label className="text-sm font-semibold text-neutral-800" htmlFor="support-name">
                  お名前
                </label>
                <input
                  id="support-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 w-full rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="山田 太郎"
                  required={type === "advertisement"}
                />
              </div>
            </div>

            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}

            {isSuccess ? (
              <div className="flex w-full flex-col gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <p>送信ありがとうございました。内容を確認し次第ご連絡いたします。</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 w-full items-center justify-center rounded bg-green-600 px-3 text-sm font-semibold text-white transition hover:bg-green-700"
                >
                  閉じる
                </button>
              </div>
            ) : (
              <div className="flex w-full items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 min-w-[100px] items-center justify-center rounded border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100"
                  disabled={isSubmitting}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="inline-flex h-11 min-w-[120px] items-center justify-center rounded bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-80"
                  disabled={isSubmitting}
                >
                  {submitButtonLabel}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
