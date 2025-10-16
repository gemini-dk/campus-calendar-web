# Convexデータ取り込み仕様

## 全体フロー概要
1. `DataManagementViewModel`（および `HomeViewModel`）で Convex API を呼び出し、対象カレンダーの詳細データを取得します。
2. 取得結果（`CalendarDay` / `CalendarSummary` / `CalendarCampus`）をローカル用モデルに変換します。
3. 変換済みデータを SQLite ベースのローカルデータベース（`CampusCalendar.sqlite3`）へ保存します。
4. 必要に応じてローカルデータベースからデータを再読込し、UI に表示します。

## Convex からのデータ取得
- 呼び出し箇所: `DataManagementViewModel.fetchCalendarDays()`。
- 使用する API: `ConvexEnvironment.client.action("calendars:getCalendarWithTracking", with: ["calendarId": currentCalendarId])`。
- 取得データ:
  - `CalendarSummary`: カレンダー概要。
  - `CalendarDay` 配列: 日別の予定情報。
  - `CalendarCampus` 配列: キャンパス情報。
- エラーハンドリング: 非同期タスク内で `Task.isCancelled` を確認しつつ、例外発生時は `errorMessage` に内容を格納します。完了後は `isLoading` を false に戻します。【F:CampusCalendar/Views/ViewModels/DataManagementViewModel.swift†L27-L146】

## ローカルデータベース
- 実装: `SQLite.swift` を利用したシングルトン `DatabaseManager`。
- DB ファイル: `NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)` で得たドキュメントディレクトリ配下に `CampusCalendar.sqlite3` を生成します。
- 初期化時に外部キー制約を有効化 (`PRAGMA foreign_keys = ON`) し、必要なテーブル（`calendar_days` など）を作成します。【F:CampusCalendar/Database/Core/DatabaseManager.swift†L4-L156】

### `calendar_days` テーブル
- 主キー: `id`（Convex ドキュメント ID）。
- 主なカラム: `creation_time`, `calendar_id`, `date`, `description`, `is_holiday`, `term_id`, `term_name`, `term_short_name`, `type`, `updated_at`, `class_order`, `class_weekday`, `national_holiday_name`, `notification_reasons`, `synced_at`, `is_deleted`。
- 対応モデル: `LocalCalendarDay` 構造体（`LocalCalendarDayType` による種別、`syncedAt` などの同期管理フィールドを保持）。【F:CampusCalendar/Database/Models/LocalCalendarDay.swift†L4-L103】

## 取得データの加工
- 変換担当: `ModelConverter` クラス。
- `CalendarDay` → `LocalCalendarDay`:
  - Convex の `CalendarDay.type` をローカル用の列挙型 `LocalCalendarDayType` に変換。
  - `syncedAt` を変換時点の UNIX 時刻で初期化し、`isDeleted` を `false` に固定。
  - そのほかのフィールドは Convex 側の値をそのままコピーします。【F:CampusCalendar/Database/Models/ModelConverter.swift†L8-L31】【F:CampusCalendar/Database/Models/ModelConverter.swift†L79-L119】
- 配列変換: `ModelConverter.toLocalArray(_:)` で Convex から受け取った `CalendarDay` 配列を一括変換します。【F:CampusCalendar/Database/Models/ModelConverter.swift†L111-L119】
- キャンパス／サマリー変換（必要時）:
  - `toLocalCampuses(_:calendarId:)` で重複排除とトリム処理を行い、ローカル ID を生成します。【F:CampusCalendar/Database/Models/ModelConverter.swift†L121-L208】
  - `toLocalSummary(_:)` でカレンダー概要の文字列フィールドをトリムしつつ `syncedAt` を設定します。【F:CampusCalendar/Database/Models/ModelConverter.swift†L161-L175】

## ローカル保存処理
- 呼び出し箇所: `DataManagementViewModel.saveToSQLite()`。
- 手順:
  1. Convex から取得した `calendarDays` を `ModelConverter.toLocalArray` で `LocalCalendarDay` 配列に変換。
  2. 保存対象カレンダー ID の既存データを `CalendarDayRepository.findByCalendarId()` で取得し、`hardDelete` で全削除。
  3. `CalendarDayRepository.saveAll()` を通してトランザクション内で全件挿入。
  4. 完了後に保存件数をメッセージとして UI に通知し、3 秒後にクリア。
  5. エラー時はメインスレッドで `errorMessage` を更新します。【F:CampusCalendar/Views/ViewModels/DataManagementViewModel.swift†L69-L111】【F:CampusCalendar/Database/Repositories/CalendarDayRepository.swift†L13-L209】

## ローカルデータの活用
- `DataManagementViewModel.loadFromSQLite()` で `CalendarDayRepository` の `findByCalendarId` または `findAll` を通じてローカルデータを読み出し、UI へ表示します。【F:CampusCalendar/Views/ViewModels/DataManagementViewModel.swift†L115-L149】
- 取得結果が空の場合は「SQLiteにデータが見つかりません」とエラーメッセージを表示します。

## まとめ
- Convex API から取得したカレンダー系データは `ModelConverter` でローカルモデルへ整形され、`CalendarDayRepository` 経由で SQLite データベース `CampusCalendar.sqlite3` に保存されます。
- ローカルモデルは同期状態（`syncedAt`、`isDeleted`）を保持しており、今後の Web/Firestore 移行時にも整合性管理の指針として利用できます。
