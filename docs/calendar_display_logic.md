# カレンダー表示仕様（Firestore移行用の論理整理）

## データソースの整理
- Firestore では `/users/{uid}/calendars/{calendarId}/days/{yyyymmdd}` に学務カレンダー情報を保持し、`CalendarDay` モデルに読み込んで利用する。フィールドには学期 ID・名称、授業日の曜日（`classWeekday`）、授業回数（`classOrder`）、祝日名称、通知理由などが含まれる。【F:CampusCalendar/Database/Models/LocalCalendarDay.swift†L14-L103】
- 表示用データは`CalendarDataService`経由で読み込まれ、日付文字列（`yyyy-MM-dd`）をキーにしてビュー・ビューModelに引き渡される。授業予定やタスク件数も同じサービスから日付単位で取得される。【F:CampusCalendar/Views/ViewModels/CalendarDataService.swift†L18-L92】
- 日付ごとの表示は`CalendarDayHeaderFormatter`が共通のフォーマッタとして担当し、日付・曜日テキスト色、学事詳細文、強調判定などを計算する。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L32-L227】

## 1. 日本のカレンダーに基づく表示
### 1.1 日付・曜日テキストの色決定
- `CalendarDayHeaderFormatter`は曜日と祝日情報を基にアクセント色を決定する。祝日フラグ（`is_holiday`）が立っていれば赤、それ以外は曜日を確認し、日曜は赤、土曜は青、平日は`Color.primary`を返す。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L32-L80】
### 1.2.カレンダー補足情報
- 祝日フラグが立っている場合、祝日名(nationalHolidayName)を表示する。その他の場合は"YYYY年MM月DD日(曜日)"と表示する。

### 1.3 曜日インジケータ
- 月間カレンダーのヘッダーは曜日ごとに固定色を割り当てており、月曜から日曜までをオレンジ〜赤の原色帯で表示する。【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L27-L47】【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L488-L505】
- 各日セルの右上には`weekdayIndicator`が描画され、授業日に設定された学事用曜日に応じた色付きドットまたは授業回数ラベルを表示する。授業回数が設定されていれば同色の長方形に回数を描く。【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L420-L439】【F:CampusCalendar/Views/ViewModels/MonthlyCalendarViewModel.swift†L209-L269】

## 2. 大学学事予定に基づく表示
### 2.1 学事情報ラベルの解釈と整形
- 学期が長期休暇(termデータのholidayFlagが1の場合)の場合は「学期名」のみとする。
- 学期が授業期間(termデータのholidayFlagが2の場合)は下記とする。
  - `CalendarDayHeaderFormatter`は学期略称（`term_short_name`）、授業曜日（`class_weekday`）、授業回数（`class_order`）を組み合わせて詳細ラベルを生成する。授業曜日はローカル値があればそれを優先し、無い場合は実際の日付から曜日を補完する。授業回数は正の整数に丸めて採用する。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L99-L227】
  - 試験日は「学期名＋試験」形式とする。
  - 休講日は「学期名＋休講日」形式とする。
  - 予備日は「学期名＋予備日」とする。

### 2.2 学事情報サブラベルの解釈と整形

カレンダーの日程と大学の日程が異なるときに注意喚起する目的でサブラベルが存在する。必ず太字など強調して表示される。

- isHoliday=trueかつtype=授業日の場合はdescriptionの内容があればこれをサブラベルとする。ない場合は"特別授業日"とする。
- isHoliday=falseかつtype=休講日の場合はサブラベルとしてdescriptionの内容があれば表示する。ない場合は"特別休講日"とする。
- 授業日で、classWeekdayが設定されており、かつ、その曜日が実際の曜日と異なる場合はサブラベルとしてdescriptionの内容を表示する。ない場合は"曜日振替授業日"とする。


### 2.2 休講日・試験日の背景処理
- 曜日が日曜日の場合は背景色として淡いグレーの背景を敷く。これは後述する学事予定のルールより優先する。
- 学事予定のtypeが休講日のときに淡いグレーの背景を敷く。
- 学事予定のtypeが試験日のときに淡い緑の背景を敷く。
- 学事予定のtypeが予備日の場合は淡い水色の背景を敷く。



## まとめ
- 一般カレンダー要素（曜日色・休祝日背景）は`CalendarDayHeaderFormatter`と各ビューの共通ロジックで一貫管理されており、Firestore移行時も同じ判定ルールを再現する必要がある。
- 学事予定は`calendar_days`のローカルデータを基に整形され、広い領域では学期・曜日・回数を文章やバッジとして表示、狭い領域では曜日色と回数バッジでコンパクトに表現する。Firestoreでも同等のフィールド構成とフォーマッタ層が求められる。
