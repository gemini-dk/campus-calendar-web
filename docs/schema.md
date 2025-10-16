# SQLiteスキーマ概要

本書では、iOS版CampusCalendarアプリがローカル永続化に利用しているSQLiteデータベースのテーブル定義と役割を整理します。データベースは`Documents/CampusCalendar.sqlite3`に作成され、`DatabaseManager`が初期化とマイグレーション（不足カラムの追加）を管理しています。

## テーブル一覧

| テーブル名 | 役割概要 |
| --- | --- |
| `calendar_days` | 学内カレンダーの日付ごとの詳細。授業日・休日等の種別を保持。 |
| `calendar_summaries` | カレンダー全体のメタデータ（学年・名称など）。 |
| `calendar_terms` | 学期情報。学期順序や授業数を含む。 |
| `calendar_campuses` | カレンダーに紐づくキャンパス情報。 |
| `timetable_classes` | 時間割の授業本体。履修状況や授業形態を保持。 |
| `timetable_weekly_slots` | 授業の週間枠（曜日・時限）情報。 |
| `timetable_class_dates` | 授業日の実績情報（出欠、実施形態など）。 |
| `activities` | 課題・メモ等のタスク管理。 |
| `activity_images` | 課題に添付する画像メタデータ。 |
| `class_time_sets` | 時限枠セット（年度別）。 |
| `class_time_periods` | 時限枠セット内の各コマの開始/終了時刻。 |
| `academic_year_settings` | 年度ごとの時間割設定。 |
| `user_settings` | ユーザー設定のキーバリューストア。 |

以下では各テーブルの列定義と役割を詳述します。

## `calendar_days`

学年カレンダーの1日単位のレコードを保持します。Convexから取得した学務カレンダーと同期し、授業日・試験日・休日などの区別を行います。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | PRIMARY KEY | ConvexのドキュメントIDに対応する一意識別子。 |
| `creation_time` | `REAL` | NOT NULL | 元データ作成時刻（UNIX秒）。 |
| `calendar_id` | `TEXT` | NOT NULL | 紐づくカレンダー（`calendar_summaries.id`）のID。 |
| `date` | `TEXT` | NOT NULL | 対象日 (`yyyy-MM-dd`) 。 |
| `description` | `TEXT` |  | 日付に関する補足説明。 |
| `is_holiday` | `INTEGER` |  | 休日フラグ。`0/1`で管理。 |
| `term_id` | `TEXT` |  | 紐づく学期ID。 |
| `term_name` | `TEXT` |  | 学期名称（例: 前期）。 |
| `term_short_name` | `TEXT` |  | 学期略称。 |
| `type` | `TEXT` | NOT NULL | 日付種別。`LocalCalendarDayType`列挙（授業日/試験日/予備日/休講日/未指定）に対応。 |
| `updated_at` | `REAL` | NOT NULL | 最終更新時刻（UNIX秒）。 |
| `class_order` | `REAL` |  | 授業順序（並び替え用）。 |
| `class_weekday` | `REAL` |  | 授業曜日（並び替え用数値）。 |
| `national_holiday_name` | `TEXT` |  | 国民の祝日名称。 |
| `notification_reasons` | `TEXT` |  | 通知理由をJSON等で保存。 |
| `synced_at` | `REAL` |  | Convexと同期した時刻。 |
| `is_deleted` | `INTEGER` | DEFAULT 0 | 論理削除フラグ。 |

### インデックス
- `idx_calendar_days_date`（`date`）
- `idx_calendar_days_calendar_id`（`calendar_id`）

## `calendar_summaries`

学年カレンダー全体のメタ情報。大学コードや会計年度などを保持します。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | PRIMARY KEY | カレンダーの一意識別子。 |
| `creation_time` | `REAL` | NOT NULL | レコード作成時刻。 |
| `created_at` | `REAL` | NOT NULL | Convex上での作成時刻。 |
| `fiscal_start` | `TEXT` |  | 会計年度の開始日。 |
| `fiscal_end` | `TEXT` |  | 会計年度の終了日。 |
| `fiscal_year` | `INTEGER` |  | 対象年度。 |
| `name` | `TEXT` |  | カレンダー名称。 |
| `university_code` | `TEXT` |  | 大学コード。 |
| `updated_at` | `REAL` | NOT NULL | 最終更新時刻。 |
| `synced_at` | `REAL` |  | Convex同期時刻。 |
| `is_deleted` | `INTEGER` | DEFAULT 0 | 論理削除フラグ。 |

### インデックス
- `idx_calendar_terms_calendar_id`（`calendar_terms.calendar_id`）により関連テーブル側で参照高速化。

## `calendar_terms`

カレンダーに属する学期情報。学期順、授業数、休日フラグなどを管理します。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | PRIMARY KEY | 学期の一意識別子。 |
| `creation_time` | `REAL` | NOT NULL | レコード作成時刻。 |
| `calendar_id` | `TEXT` | NOT NULL | 親カレンダーID（`calendar_summaries.id`）への外部キー。 |
| `term_name` | `TEXT` | NOT NULL | 学期名称。 |
| `short_name` | `TEXT` |  | 学期略称。 |
| `term_order` | `REAL` |  | 並び順（数値）。 |
| `class_count` | `REAL` |  | 授業コマ数など数量情報。 |
| `holiday_flag` | `INTEGER` |  | 休日扱いかどうか。 |
| `updated_at` | `REAL` | NOT NULL | 最終更新時刻。 |
| `synced_at` | `REAL` |  | 同期時刻。 |
| `is_deleted` | `INTEGER` | DEFAULT 0 | 論理削除フラグ。 |

### インデックス
- `idx_calendar_terms_calendar_id`（`calendar_id`）

## `calendar_campuses`

カレンダーに紐づくキャンパスや事務情報を保持します。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | PRIMARY KEY | キャンパス識別子。 |
| `calendar_id` | `TEXT` | NOT NULL | 対応するカレンダーID。 |
| `campus_name` | `TEXT` | NOT NULL | キャンパス名称。 |
| `office_code` | `TEXT` |  | 事務局コード。 |
| `office_name` | `TEXT` |  | 事務局名称。 |
| `class10_code` | `TEXT` |  | 10進分類コード等。 |
| `class10_name` | `TEXT` |  | 10進分類名称。 |

### インデックス
- `idx_calendar_campuses_calendar_id`（`calendar_id`）

## `timetable_classes`

時間割の授業本体を表します。授業名・担当者・単位数・授業形態などを保持します。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `INTEGER` | PRIMARY KEY | 授業ID。 |
| `fiscal_year` | `INTEGER` |  | 開講年度。 |
| `class_name` | `TEXT` |  | 授業名。 |
| `location` | `TEXT` |  | 教室・実施場所。 |
| `term` | `TEXT` |  | 学期情報。 |
| `teacher` | `TEXT` |  | 担当教員名。 |
| `credits` | `REAL` |  | 単位数。 |
| `memo` | `TEXT` |  | メモ。 |
| `credits_status` | `INTEGER` |  | 履修状況。`TimetableCreditsStatus`（履修中/修得済/不合格）。 |
| `class_type` | `TEXT` |  | 授業形態。`TimetableClassType`（対面/オンライン/ハイブリッド/オンデマンド）。 |
| `schedule_scope` | `TEXT` |  | シラバスなどの範囲情報。 |
| `omit_weekly_slots` | `INTEGER` |  | 週間枠を省略する設定。 |
| `max_absence_days` | `INTEGER` | DEFAULT 0 | 欠席許容上限。 |

### インデックス
- `idx_activities_class_id`（`activities.class_id`）が外部参照を高速化。

## `timetable_weekly_slots`

授業の定期的な曜日・時限を保持します。`timetable_classes`に外部キー制約あり。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `INTEGER` | PRIMARY KEY | スロットID。 |
| `class_id` | `INTEGER` | NOT NULL | 親授業ID（`timetable_classes.id`）。 |
| `day_of_week` | `INTEGER` |  | 曜日（0=日〜6=土を想定）。 |
| `period` | `INTEGER` |  | 時限番号。 |

### インデックス
- （特定のインデックスは定義されていません）

## `timetable_class_dates`

個別の日付ごとの授業記録。出欠状況や実施形態の振り替えを保存します。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `INTEGER` | PRIMARY KEY | レコードID。 |
| `class_id` | `INTEGER` | NOT NULL | 授業IDへの外部キー。 |
| `class_date` | `TEXT` |  | 授業日 (`yyyy-MM-dd`) 。 |
| `periods` | `TEXT` |  | 対象時限（"1,2"形式）。 |
| `attendance_status` | `INTEGER` |  | 出欠状態。`AttendanceStatus`（出席/欠席/遅刻）。 |
| `hybrid_delivery_type` | `INTEGER` | DEFAULT 0 | 実施形態。`TimetableClassDateDeliveryType`（未定/対面/オンライン）。 |
| `is_test` | `INTEGER` | DEFAULT 0 | 試験回フラグ。 |
| `is_excluded_from_summary` | `INTEGER` | DEFAULT 0 | 集計対象外フラグ。 |
| `is_auto_generated` | `INTEGER` | DEFAULT 0 | 自動生成レコードかどうか。 |
| `is_cancelled` | `INTEGER` | DEFAULT 0 | 休講フラグ。 |

## `activities`

課題・メモなどのアクティビティ管理。授業に紐付くタスクとして利用されます。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `INTEGER` | PRIMARY KEY | アクティビティID。 |
| `title` | `TEXT` | NOT NULL | タイトル。 |
| `notes` | `TEXT` |  | 詳細メモ。 |
| `status` | `INTEGER` | DEFAULT 0 | 進捗。`ActivityStatus`（未完了/完了）。 |
| `due_date` | `TEXT` |  | 期限日 (`yyyy-MM-dd`) 。 |
| `class_id` | `INTEGER` |  | 参照する授業ID（`timetable_classes.id`）。 |
| `type` | `INTEGER` | DEFAULT 0 | 種別。`ActivityType`（課題/メモ）。 |
| `created_at` | `REAL` | NOT NULL | 作成時刻。 |
| `updated_at` | `REAL` | NOT NULL | 更新時刻。 |

### インデックス
- `idx_activities_type`（`type`）
- `idx_activities_class_id`（`class_id`）

## `activity_images`

課題に関連付ける画像ファイルのメタデータを保存します。OCR結果などもここに格納されます。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `INTEGER` | PRIMARY KEY | 画像ID。 |
| `activity_id` | `INTEGER` |  | 紐づくアクティビティID（`activities.id`）。NULL時は未紐付け。 |
| `file_path` | `TEXT` | NOT NULL | ドキュメントディレクトリ内の保存パス。 |
| `file_name` | `TEXT` | NOT NULL | ファイル名。 |
| `ocr_text` | `TEXT` |  | OCR抽出テキスト。 |
| `fiscal_year` | `INTEGER` | NOT NULL | 関連年度。 |
| `file_size` | `INTEGER` | NOT NULL | バイト単位のファイルサイズ。 |
| `created_at` | `REAL` | NOT NULL | 登録時刻。 |

### インデックス
- `idx_activity_images_activity_id`（`activity_id`）
- `idx_activity_images_fiscal_year`（`fiscal_year`）

## `class_time_sets`

年度ごとに定義した時限枠セットを管理します。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `INTEGER` | PRIMARY KEY | 時限セットID。 |
| `fiscal_year` | `INTEGER` |  | 対象年度。 |
| `created_at` | `REAL` | NOT NULL | 作成時刻。 |
| `updated_at` | `REAL` | NOT NULL | 更新時刻。 |

## `class_time_periods`

`class_time_sets`に紐づく各時限の時間帯を表します。セット内で`period`がユニークになるよう制約・インデックスを持ちます。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | `INTEGER` | PRIMARY KEY | 時限レコードID。 |
| `class_time_set_id` | `INTEGER` | NOT NULL | 親セットID（`class_time_sets.id`）。 |
| `period` | `INTEGER` | NOT NULL | 時限番号。 |
| `start` | `TEXT` | NOT NULL | 開始時刻（`HH:mm`想定）。 |
| `end` | `TEXT` | NOT NULL | 終了時刻。 |
| `created_at` | `REAL` | NOT NULL | 作成時刻。 |
| `updated_at` | `REAL` | NOT NULL | 更新時刻。 |

### インデックス
- `idx_class_time_periods_set_id`（`class_time_set_id`）
- `idx_class_time_periods_set_period`（`class_time_set_id`,`period`）UNIQUE

## `academic_year_settings`

年度ごとの時間割設定。1日の授業コマ数や土曜授業の有無、利用する時限セットIDなどを保持します。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `fiscal_year` | `INTEGER` | PRIMARY KEY | 対象年度。 |
| `classes_per_day` | `INTEGER` | NOT NULL | 1日の授業最大コマ数。 |
| `has_saturday_classes` | `INTEGER` | NOT NULL | 土曜授業の有無。`0/1`。 |
| `class_time_set_id` | `INTEGER` |  | 紐づける時限セットID。NULLで未設定。 |
| `created_at` | `REAL` | NOT NULL | 作成時刻。 |
| `updated_at` | `REAL` | NOT NULL | 更新時刻。 |

### インデックス
- `idx_academic_year_settings_year`（`fiscal_year`）※PRIMARY KEYと同等のユニーク制約。

## `user_settings`

アプリ全体の設定値をキーバリュー形式で保存します。大学選択やニックネームなどのユーザー設定を保持します。

| 列名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `name` | `TEXT` | PRIMARY KEY | 設定キー（例:`university.id`）。`UserSettingKey`に定義されたキー群と一致。 |
| `value` | `TEXT` | NOT NULL | 設定値。JSON文字列を格納するケースもある。 |

## 外部キーとリレーション

- `calendar_terms.calendar_id` → `calendar_summaries.id`
- `calendar_days.calendar_id` → `calendar_summaries.id`
- `timetable_weekly_slots.class_id` → `timetable_classes.id`
- `timetable_class_dates.class_id` → `timetable_classes.id`
- `activities.class_id` → `timetable_classes.id`
- `activity_images.activity_id` → `activities.id`
- `academic_year_settings.class_time_set_id` → `class_time_sets.id`
- `class_time_periods.class_time_set_id` → `class_time_sets.id`

## マイグレーション補足

`DatabaseManager.addMissingColumnsIfNeeded()`では既存データベースに不足カラムがある場合に`ALTER TABLE`で追加します。対象は以下のカラムです。

- `calendar_days.term_id`
- `calendar_days.term_short_name`
- `calendar_days.notification_reasons`
- `timetable_classes.max_absence_days`
- `timetable_class_dates.is_test`
- `timetable_class_dates.hybrid_delivery_type`
- `timetable_class_dates.is_excluded_from_summary`
- `timetable_class_dates.is_auto_generated`
- `timetable_class_dates.is_cancelled`
- `class_time_sets.fiscal_year`

これらはバージョンアップ時の互換性維持に利用されています。
