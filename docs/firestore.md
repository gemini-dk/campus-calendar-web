# Firestore スキーマ概要

CampusCalendar Web で利用している Firestore コレクションと主要フィールドを整理します。ユーザーデータは `/users/{uid}` 配下に集約し、大学カレンダーなどの共有データはトップレベルコレクションに保持しています。

## トップレベル（共有データ）

### `universities`
- 大学情報を保持するコレクション。`webId` や `code` をキーに検索し、`calendars` サブコレクション（またはフィールド `fiscalYears.{year}.calendars`）から年度別カレンダー一覧を取得します。【F:src/lib/data/repository/university.repository.ts†L135-L198】【F:src/lib/data/repository/university.repository.ts†L329-L384】
- 掲載カレンダーは `name`（表示名）、`webId`、`order`、`fiscalYear` などを保持し、大学コードごとの年度コレクション `calendars_{fiscalYear}` からも取得可能です。【F:src/lib/data/repository/university.repository.ts†L300-L366】

### `calendars_{fiscalYear}`
- 大学コード別に公開カレンダーを格納する年度コレクション。フィールド `universityCode` と `isPublishable` でフィルタリングし、`name`、`calendarId`、`fiscalYear` を持つドキュメントを取得します。【F:src/lib/data/repository/university.repository.ts†L300-L341】

### `support`
- フィードバック送信用のコレクション。`date`（serverTimestamp）、`type`（"間違い報告"/"カレンダー追加依頼"/"広告枠の募集"）、`fromEmail`、`fromName`、`content`、`info` を保存します。【F:src/app/(public)/[webId]/calendar/_components/SupportDialog.tsx†L63-L112】

## `/users/{uid}` ツリー

### ルートドキュメント
- プロファイルとタイムゾーンなどを保持します。主要フィールドは `displayName`、`email`、`timezone`、`nickname`、`iconUrl`、`createdAt`、`updatedAt` などです。【F:docs/schema.md†L16-L33】【F:src/lib/useAuth.ts†L56-L104】【F:src/lib/useAuth.ts†L115-L162】

### `settings` サブコレクション
- 設定キーをドキュメント ID とし、`value` もしくは型別フィールドで保存する設定ストア。頻出値はルートドキュメントへミラーする場合があります。【F:docs/schema.md†L35-L42】

### `calendars/{calendarId}`
- 学務カレンダーのメタデータ (`name`、`fiscalYear`、`universityCode` など) を保持し、`terms`・`days`・`campuses` サブコレクションに学期・授業日・キャンパス情報を格納します。【F:docs/schema.md†L44-L74】

### `academic_years/{fiscalYear}`
- 年度設定 (`classesPerDay`、`classTimeSetId`、`calendarId` など) を保持し、以下のサブコレクションを持ちます。【F:docs/schema.md†L76-L111】
  - `class_time_sets/{classTimeSetId}`：授業時限セット。`periods/{periodNumber}` に `start`、`end`、`label` を保存します。【F:docs/schema.md†L83-L92】
  - `timetable_classes/{classId}`：授業情報。`classType`、`creditsStatus`、`termNames`、`weekly_slots` などを保持します。【F:docs/schema.md†L94-L112】
    - `weekly_slots/{slotId}`：曜日・時限や表示順を格納します。【F:docs/schema.md†L112-L113】
  - `class_dates/{classDateId}`：授業日程。`classId`、`classDate`、`periods`、`attendanceStatus`、`isCancelled` などを保持します。【F:docs/schema.md†L115-L126】

### `activities/{activityId}`
- 課題・メモを格納するコレクション。`title`、`notes`、`status`、`dueDate`、`classId` などを保持し、`attachments` サブコレクションにファイルメタデータを保存します。【F:docs/schema.md†L128-L148】

### `integrations/googleCalendar`
- Google カレンダー連携の状態を保存するドキュメント。アクセストークンや `syncTokens`、`calendarList`、同期状態 (`lastSyncStatus`、`lastSyncedAt` など) を保持します。【F:src/lib/google-calendar/constants.ts†L5-L11】【F:src/lib/google-calendar/types.ts†L1-L27】

### `google_calendar_events`
- Google カレンダーから同期したイベント一覧。`eventUid` をドキュメント ID とし、`calendarId`、`summary`、`startTimestamp`、`dayKeys`、`updatedAt` などのフィールドを保存します。【F:src/lib/google-calendar/constants.ts†L7-L11】【F:src/lib/google-calendar/types.ts†L19-L55】

## 補足
- `migrations` コレクションや `class_dates` などのインデックス設計・セキュリティルールの詳細は `docs/schema.md` を参照してください。【F:docs/schema.md†L146-L210】
