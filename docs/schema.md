# Firestoreデータモデル設計（SQLite移行版）

本書は iOS 版 CampusCalendar がローカル SQLite で保持していたデータ資産を、Firestore 上の `/users/{uid}` 階層に移植するためのデータ構造を定義します。SQLite 時代の各テーブルはユーザー固有データとして扱い、FireStore でもユーザーごとの完全分離を前提に設計します。

## コレクションツリー全体像

```
/users/{uid}
  profile (document)
  /settings/{settingKey}
  /calendars/{calendarId}
      ...calendar metadata fields...
      /terms/{termId}
      /days/{yyyymmdd}
      /campuses/{campusId}
  /academic_years/{fiscalYear}
      ...year settings...
      /class_time_sets/{classTimeSetId}
          /periods/{periodNumber}
      /timetable_classes/{classId}
          /weekly_slots/{slotId}
      /class_dates/{classDateId}
  /activities/{activityId}
      /attachments/{attachmentId}
  /migrations/{jobId} (任意)
```

- `/users/{uid}` 直下にユーザーのプロファイルや全データを保持し、Security Rules で `request.auth.uid == uid` を必須とします。
- 共通リファレンス（大学一覧、祝祭日マスタ等）が必要な場合は別コレクションをトップレベルに用意し、読み取り専用とします（本書では扱いません）。

## `/users/{uid}` ドキュメント

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `displayName` | string | 任意表示名。 |
| `email` | string | Firebase Auth からの参照用。 |
| `timezone` | string | 例: `Asia/Tokyo`。 |
| `createdAt` / `updatedAt` | timestamp | Firestore サーバタイムスタンプを保存。 |

### `settings` サブコレクション（`user_settings` 対応）

- ドキュメント ID を設定キー（例: `university.id`、`dashboard.favoriteClassIds`）にし、`value` フィールドへ JSON 文字列、もしくは型別フィールド（`valueString`, `valueNumber` 等）を格納します。
- 取得頻度の高い項目は `/users/{uid}` のトップレベルにミラーしても構いませんが、書き込みの一貫性を担保するためサーバサイドで同期します。

## `calendars` サブコレクション（`calendar_*` テーブル対応）

### `/users/{uid}/calendars/{calendarId}`

| フィールド | 型 | 元テーブル |
| --- | --- | --- |
| `name` | string | `calendar_summaries.name` |
| `fiscalYear` | number | `calendar_summaries.fiscal_year` |
| `fiscalStart` / `fiscalEnd` | string (ISO date) | `calendar_summaries.fiscal_start/end` |
| `universityCode` | string | `calendar_summaries.university_code` |
| `syncedAt` | timestamp | `calendar_summaries.synced_at` |
| `isDeleted` | boolean | `calendar_summaries.is_deleted` |
| `createdAt` / `updatedAt` | timestamp | Firestore 書き込み時刻 |

#### サブコレクション

| パス | フィールド概要 | 元テーブル |
| --- | --- | --- |
| `terms/{termId}` | `termName`, `shortName`, `termOrder`, `classCount`, `isHoliday`, `updatedAt` | `calendar_terms` |
| `days/{yyyymmdd}` | `date`, `type`, `termName`, `termShortName`, `classWeekday`, `classOrder`, `nationalHolidayName`, `notificationReasons[]`, `isDeleted`, `syncedAt`, `updatedAt` | `calendar_days` |
| `campuses/{campusId}` | `name`, `shortName`, `notes`, `updatedAt` | `calendar_campuses` |

ドキュメント ID は元の主キーを利用します。`days` コレクションは `YYYY-MM-DD` を ID とし、同一日に複数レコードが存在しないよう保証します。

### インデックス例

- `days` で `date` 昇順 + `type` フィルタの複合インデックス。
- `terms` で `termOrder` ソート。

## `academic_years` サブコレクション

### `/users/{uid}/academic_years/{fiscalYear}`

| フィールド | 型 | 元テーブル |
| --- | --- | --- |
| `fiscalYear` | number | `academic_year_settings.fiscal_year` |
| `classesPerDay` | number | `academic_year_settings.classes_per_day` |
| `hasSaturdayClasses` | boolean | `academic_year_settings.has_saturday_classes` |
| `classTimeSetId` | string|null | `academic_year_settings.class_time_set_id` |
| `calendarId` | string | 利用する学務カレンダー ID（冗長保持） |
| `createdAt` / `updatedAt` | timestamp | Firestore 書き込み時刻 |

#### `class_time_sets` サブコレクション

- ドキュメント ID: `classTimeSetId`（旧 `class_time_sets.id` に相当）。
- フィールド: `name`, `description`, `fiscalYear`, `updatedAt`。
- サブコレクション `periods/{periodNumber}` （旧 `class_time_periods`）で `start`, `end`, `label`, `createdAt`, `updatedAt` を保持します。`periodNumber` は文字列 `"1"`, `"2"` のように保持するとクエリが簡潔です。

#### `timetable_classes` サブコレクション

| フィールド | 型 | 説明 | 元テーブル |
| --- | --- | --- | --- |
| `className` | string | 必須。前後空白を除去。 | `timetable_classes.name` |
| `termNames[]` | array<string> | 表示用学期配列。 | `timetable_classes.term_names` 等 |
| `termDisplayName` | string|null | `termNames` 結合文字列。 | - |
| `classType` | string enum (`in_person`/`online`/`hybrid`/`on_demand`) | 実施形態。 | `timetable_classes.class_format` |
| `credits` | number|null | 単位数。 | `timetable_classes.credits` |
| `creditsStatus` | string enum (`in_progress`/`completed`/`failed`) | 履修状況。 | `timetable_classes.credits_status` |
| `teacher` | string|null | 講師名。 | `timetable_classes.teacher` |
| `location` | string|null | 教室。ハイブリッド授業の場合は未使用。 | `timetable_classes.location` |
| `locationInPerson` | string|null | ハイブリッド授業の対面場所。 | - |
| `locationOnline` | string|null | ハイブリッド授業のオンライン場所。 | - |
| `memo` | string|null | 補足メモ。 | `timetable_classes.memo` |
| `isFullyOnDemand` | boolean | オンデマンド判定。 | `timetable_classes.is_fully_on_demand` |
| `maxAbsenceDays` | number | 欠席許容上限。 | `timetable_classes.max_absence_days` |
| `calendarId` | string | 参照カレンダー ID。 | `timetable_classes.calendar_id` |
| `createdAt` / `updatedAt` | timestamp | Firestore サーバタイムスタンプ。 | - |

##### サブコレクション

- `weekly_slots/{slotId}`（旧 `timetable_weekly_slots`）
  フィールド: `dayOfWeek`(1=Mon〜7=Sun), `period`, `displayOrder`, `createdAt`, `updatedAt`。

#### `class_dates` コレクション

- パス: `/users/{uid}/academic_years/{fiscalYear}/class_dates/{classDateId}`（旧 `timetable_class_dates`）
- ドキュメント ID 例: `classId#YYYY-MM-DD` または `classId#YYYY-MM-DD#slotHash`
- フィールド:
  - `classId` (string)
  - `classDate` (ISO `YYYY-MM-DD`)
  - `periods` (array<number | string>)
  - `attendanceStatus` (`present`/`absent`/`late`/`null`)
  - `isTest`, `isExcludedFromSummary`, `isAutoGenerated`, `isCancelled` (boolean)
  - `deliveryType` (`unknown`/`in_person`/`remote`)
  - `hasUserModifications` (boolean)
  - `updatedAt` (timestamp)

### インデックス例

- `/users/{uid}/academic_years/{year}/timetable_classes`: `classType` + `termNames`（array-contains）複合。
- `/users/{uid}/academic_years/{year}/class_dates`: `classId` equality + `classDate` 昇順、`isExcludedFromSummary` フィルタ。

## `activities` サブコレクション

### `/users/{uid}/activities/{activityId}`

| フィールド | 型 | 元テーブル |
| --- | --- | --- |
| `title` | string | `activities.title` |
| `notes` | string | `activities.notes` |
| `status` | string enum (`pending`, `done`) | `activities.status` |
| `dueDate` | string|null (`YYYY-MM-DD`) | `activities.due_date` |
| `classId` | string|null | `activities.class_id` |
| `type` | string enum (`assignment`, `memo`) | `activities.type` |
| `createdAt` / `updatedAt` | timestamp | `activities.created_at/updated_at` |

#### `attachments` サブコレクション（`activity_images` 対応）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `storagePath` | string | Firebase Storage のパス。 |
| `fileName` | string | 表示用ファイル名。 |
| `fileSize` | number | バイト数。 |
| `fiscalYear` | number | 紐づく年度。 |
| `ocrText` | string | OCR 結果（任意）。 |
| `uploadedAt` | timestamp | アップロード時刻。 |

## `migrations` コレクション（任意）

- Convex / SQLite からの移行ジョブ履歴を保持します。  
- フィールド: `source` (`convex`, `sqlite`), `status` (`pending`, `success`, `failed`), `startedAt`, `finishedAt`, `records` (数値) など。
- 失敗時のスタックトレースはサマリーのみを保存し、詳細は Cloud Logging へ出力します。

## SQLite → Firestore 対応表

| SQLite テーブル | Firestore パス |
| --- | --- |
| `calendar_summaries` | `/users/{uid}/calendars/{calendarId}` |
| `calendar_days` | `/users/{uid}/calendars/{calendarId}/days/{date}` |
| `calendar_terms` | `/users/{uid}/calendars/{calendarId}/terms/{termId}` |
| `calendar_campuses` | `/users/{uid}/calendars/{calendarId}/campuses/{campusId}` |
| `timetable_classes` | `/users/{uid}/academic_years/{fiscalYear}/timetable_classes/{classId}` |
| `timetable_weekly_slots` | `/users/{uid}/academic_years/{fiscalYear}/timetable_classes/{classId}/weekly_slots/{slotId}` |
| `timetable_class_dates` | `/users/{uid}/academic_years/{fiscalYear}/class_dates/{classDateId}` |
| `activities` | `/users/{uid}/activities/{activityId}` |
| `activity_images` | `/users/{uid}/activities/{activityId}/attachments/{attachmentId}` |
| `class_time_sets` | `/users/{uid}/academic_years/{fiscalYear}/class_time_sets/{classTimeSetId}` |
| `class_time_periods` | `/users/{uid}/academic_years/{fiscalYear}/class_time_sets/{classTimeSetId}/periods/{periodNumber}` |
| `academic_year_settings` | `/users/{uid}/academic_years/{fiscalYear}` |
| `user_settings` | `/users/{uid}/settings/{settingKey}` |

## セキュリティルールの指針

- ルールテンプレート:
  ```
  match /users/{uid}/{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
  ```
- `class_dates.attendanceStatus` の更新は Cloud Functions などサーバ側で検証し、`maxAbsenceDays` を逸脱する場合は拒否します。
- 添付ファイルは Storage に保存し、Firestore 側ではメタデータのみを保持します。Storage ルールも同様に `request.auth.uid == uid` を強制します。

## インデックス設計

| ユースケース | 推奨複合インデックス |
| --- | --- |
| カレンダー期間検索 | `/users/{uid}/calendars/{calendarId}/days`: `date` ASC, `type` equality |
| 学期別授業一覧 | `/users/{uid}/academic_years/{year}/timetable_classes`: `termNames ARRAY_CONTAINS`, `classType` |
| 出欠集計 | `/users/{uid}/academic_years/{year}/class_dates`: `classId`, `isExcludedFromSummary == false`, `classDate` ASC |
| 課題締切順 | `/users/{uid}/activities`: `status`, `dueDate` ASC |

## マイグレーション手順メモ

1. SQLite から各テーブルを抽出し、ユーザー UID ごとの JSON に変換。
2. バッチ書き込みで `/users/{uid}` 以下に作成。`syncedAt` や `createdAt` はサーバタイムスタンプで初期化します。
3. 取り込みが完了したら `migrations` に結果レコードを追加し、UI 側で最新同期時刻を表示。
4. クライアントでは Firestore のリアルタイムリスナーを利用し、出欠・課題更新が即時反映されるよう購読します。

この構成により、ローカル SQLite のデータモデルを Firestore 上でユーザー単位に安全に再現でき、将来的なリアルタイム同期や共同編集拡張にも対応しやすくなります。
