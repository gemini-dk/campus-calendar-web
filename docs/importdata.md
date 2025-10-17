# Convexデータ取り込み仕様（Firestore 移行版）

Convex API で提供される大学カレンダー情報を取得し、Firestore 上のユーザー専用スペース `/users/{uid}` に保存するためのフローを整理します。ローカル SQLite は利用せず、すべての永続化は Firestore に集約します。

## 全体フロー
1. クライアント（`DataManagementViewModel` など）が Convex のアクション `calendars:getCalendarWithTracking` を呼び出し、カレンダー概要・日別データ・キャンパス情報を取得する。
2. 取得データをアプリ内モデル（`CalendarSummary`, `CalendarDay`, `CalendarCampus`）へ変換。
3. Firestore バッチを組み立て、`/users/{uid}/calendars/{calendarId}` 以下へ書き込む。
4. 書き込み完了後に同期時刻 `syncedAt` を更新し、必要があれば UI に反映するためデータを再読込する。

## Convex からのデータ取得
- 呼び出し箇所: `DataManagementViewModel.fetchCalendarDays()`（既存ロジックを流用）。
- 取得データ:
  - `CalendarSummary`
  - `CalendarDay[]`
  - `CalendarCampus[]`
- エラーハンドリング: キャンセル (`Task.isCancelled`) を確認しつつ例外を伝播。UI では `errorMessage` を更新して通知する。

## Firestore 書き込み先

| Convexデータ | Firestore パス | 備考 |
| --- | --- | --- |
| `CalendarSummary` | `/users/{uid}/calendars/{calendarId}` | ドキュメントに `name`, `fiscalYear`, `fiscalStart`, `fiscalEnd`, `universityCode`, `syncedAt` 等を保存。 |
| `CalendarTerm`（`summary.terms`） | `/users/{uid}/calendars/{calendarId}/terms/{termId}` | `termOrder`, `classCount`, `isHoliday` を含める。 |
| `CalendarDay` | `/users/{uid}/calendars/{calendarId}/days/{yyyy-mm-dd}` | `type`, `termName`, `classWeekday`, `classOrder`, `notificationReasons[]`, `isDeleted` など。 |
| `CalendarCampus` | `/users/{uid}/calendars/{calendarId}/campuses/{campusId}` | 重複排除後に保存。 |

`syncedAt` と `updatedAt` は `FieldValue.serverTimestamp()` を利用します。既存ドキュメントが存在する場合は `calendarId`/`date` で上書きします。

## バッチ書き込み手順
1. `writeBatch(db)` を開始。
2. カレンダー本体を `set`（`merge: true`）で書き込み、`syncedAt` を更新。
3. `terms`, `days`, `campuses` をループし、各ドキュメントを `set`。削除レコードは `isDeleted == true` のまま保持し、必要に応じてクライアントでフィルタ。
4. バッチを `commit()`。完了後に UI 用のローカルステートを更新。
5. 取り込み成功履歴を `/users/{uid}/migrations/{jobId}`（任意）に記録すると運用しやすい。

## 既存データの再読込
- Firestore へ書き込んだ直後に最新値を利用する場合は、リアルタイムリスナーを利用するか、`getDocs` を再発行してローカル状態を再構築します。
- クエリ例: `/users/{uid}/calendars/{calendarId}/days` を `where("isDeleted", "==", false)` と `orderBy("date")` で取得。

## スキーマ変換メモ
- Convex の `CalendarDay.type` は Firestore 側でそのまま文字列 Enum として保持。アプリの表示ロジック（`CalendarDayHeaderFormatter`）は既存の `LocalCalendarDay` モデルを Firestore 版に読み替えるだけで利用可能。
- `notificationReasons` は Convex から配列で受け取れるため、FireStore でも文字列配列として保存します。
- 同期済みデータを論理削除する場合は Firestore の `isDeleted` を `true` に更新し、クライアントで除外します（物理削除は行わない）。

## エラーハンドリングとリトライ
- Convex 呼び出し失敗時は Firestore 書き込みを行わず、ユーザーにリトライを促します。
- バッチコミット失敗時は部分的な書き込みが発生しないため、安全に再実行できます。必要に応じて指数バックオフを実装します。

以上の手順で、従来 SQLite に保存していた学務カレンダー情報を Firestore に直接同期でき、各端末でリアルタイムに共有可能となります。
