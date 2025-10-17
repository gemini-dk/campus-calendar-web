# 出欠管理仕様（Firestore 移行版）

出欠に関わるデータは `/users/{uid}/academic_years/{fiscalYear}/timetable_classes/{classId}/class_dates/{classDateId}` に保存します。各授業は `/users/{uid}/academic_years/{fiscalYear}/timetable_classes/{classId}` で `maxAbsenceDays` などの集計値を保持します。

## データモデル
- **出欠ステータス (`AttendanceStatus`)**  
  Firestore では文字列 Enum を採用します。  
  | 値 | 画面表示 | メモ |
  | --- | --- | --- |
  | `present` | 出席 | 旧 SQLite の `1`。 |
  | `absent` | 欠席 | 旧 SQLite の `0`。 |
  | `late` | 遅刻 | 旧 SQLite の `2`。 |
  | `null` | 未入力 | Firestore ではフィールド未設定または `null`。 |

  画面ではステータス名に応じて色分け（出席=緑、欠席=赤、遅刻=黄）を行います。

- **授業 (`TimetableClass`)**  
  `maxAbsenceDays`、`omitWeeklySlots`、`calendarId`、`termNames` 等を保持し、出欠集計の単位となります。Firestore 上では `timetable_classes` ドキュメントとして管理します。

- **授業日 (`TimetableClassDate`)**  
  `attendanceStatus`・`isTest`・`isExcludedFromSummary`・`isCancelled`・`deliveryType`・`hasUserModifications` などを保持します。集計対象判定は `isExcludedFromSummary` で行います。

## Firestore フィールド対応（クライアント保存ルール）
- `attendanceStatus` はステータス変更時にのみ書き込み、`null` に戻す場合はフィールド削除か `FieldValue.delete()` を推奨します。
- `isCancelled` を `true` にした場合は `attendanceStatus` を `null` に戻し、`isExcludedFromSummary` を `true` に切り替えるか UI 側で選択させます。
- `deliveryType` は `unknown`/`in_person`/`remote` の 3 値をサポートし、ハイブリッド対応が必要な場合は配列化を検討します。

## 授業登録・編集時の設定
- 授業日を自動生成または手動編集すると、`isExcludedFromSummary == false` かつ `isCancelled == false` の件数を再計算し、`maxAbsenceDays` を更新します。
  - `omitWeeklySlots == true`（完全オンデマンド）の場合は `maxAbsenceDays = 0` に固定。
  - それ以外では `floor(対象件数 × 0.33)` を算出し、対象件数でクリップします。
- `maxAbsenceDays` は UI で 0〜対象件数の範囲に制限し、対象件数が変わった場合に自動的に上下限を更新します。
- `hasUserModifications` が `true` の授業日は自動生成ロジックで上書きしません。

## 集計ロジック
- 出欠サマリーは `isExcludedFromSummary == false` かつ `isCancelled == false` の授業日のみ対象とします。
- 各授業について以下を算出し、クライアント状態に保持します。
  - **出席数 (`presentCount`)**: `attendanceStatus == "present"` の件数。
  - **欠席数 (`absentCount`)**: `attendanceStatus == "absent"` の件数。
  - **遅刻数 (`lateCount`)**: `attendanceStatus == "late"` の件数。
  - **未記入数 (`unrecordedCount`)**: `attendanceStatus` が `null` または未設定で、当日以前の授業日。未来日の未入力はカウントしません。
  - **授業回数 (`totalCount`)**: 対象授業日の総数。
  - **最大欠席可能日数 (`maxAbsenceDays`)**: 授業ドキュメントの値を使用します。

## 表示仕様
- `AttendanceProgressView` では上記サマリーを可視化し、「出席数/授業回数」をメイン指標とします。
  - 出席数・遅刻数・未記入数を積み上げバーとして表示し、欠席数は右端から赤色で塗り分けます。
  - 最大欠席可能日数が設定されている場合は許容欠席割合に対応する位置へ黒いしきい値マーカーを表示します。
  - ラベルには「出席数/授業回数（遅刻・未記入の内訳付き）」と、「欠席数/最大欠席可能日数」を示します。
  - 残り欠席可能日数が 0 の場合は警告メッセージを表示し、超過時は注意メッセージに切り替えます。
- 授業カードや詳細画面では、このサマリーと個別授業日の出欠ボタンを組み合わせ、遅刻・欠席・出席のいずれかを即時更新できるようにしています。

## セキュリティおよびバリデーション指針
- `class_dates` の書き込みは `request.auth.uid == uid` を必須とし、`attendanceStatus` の入力値が上記 Enum に含まれるかルールで検証します。
- クライアントはローカルで `maxAbsenceDays` の超過を判定し警告表示を行うとともに、Cloud Functions でサーバサイドの再計算・監査を実施します。
- 履歴保持が必要な場合は、`attendance_updates` のようなサブコレクションを追加し、更新前後の値と `updatedBy` を記録します（オプション）。
