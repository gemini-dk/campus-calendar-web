# カレンダー表示仕様（Firestore移行用の論理整理）

## データソースの整理
- Firestore では `/users/{uid}/calendars/{calendarId}/days/{yyyymmdd}` に学務カレンダー情報を保持し、`CalendarDay` モデルに読み込んで利用する。フィールドには学期 ID・名称、授業日の曜日（`classWeekday`）、授業回数（`classOrder`）、祝日名称、通知理由などが含まれる。【F:CampusCalendar/Database/Models/LocalCalendarDay.swift†L14-L103】
- 表示用データは`CalendarDataService`経由で読み込まれ、日付文字列（`yyyy-MM-dd`）をキーにしてビュー・ビューModelに引き渡される。授業予定やタスク件数も同じサービスから日付単位で取得される。【F:CampusCalendar/Views/ViewModels/CalendarDataService.swift†L18-L92】
- 日付ごとの表示は`CalendarDayHeaderFormatter`が共通のフォーマッタとして担当し、日付・曜日テキスト色、学事詳細文、強調判定などを計算する。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L32-L227】

## 1. 日本のカレンダーに基づく表示
### 1.1 日付・曜日テキストの色決定
- `CalendarDayHeaderFormatter`は曜日と祝日情報を基にアクセント色を決定する。祝日フラグ（`is_holiday`）が立っていれば赤、それ以外は曜日を確認し、日曜は赤、土曜は青、平日は`Color.primary`を返す。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L32-L80】
- 同フォーマッタはハイライト色も提供し、祝日は赤、日曜赤／土曜青／その他はアクセントカラー（システム既定色）とする。月間カレンダーのヘッダーや日詳細画面の強調表示に利用される。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L50-L63】【F:CampusCalendar/Views/ViewModels/MonthlyCalendarViewModel.swift†L198-L273】
- ホーム画面や日詳細画面では`dayAccentColor`を用いて日付・曜日のテキスト色を統一。祝日または日曜は赤、土曜は青、その他は`Color.primary`が使用される。【F:CampusCalendar/Views/Dashboard/DashboardView.swift†L907-L919】【F:CampusCalendar/Views/Calendar/DayDetailView.swift†L347-L359】
- 週カレンダーの各日カードでも`CalendarDayHeaderFormatter.makeDisplayData`で得られたアクセント色が日付・曜日テキストに反映される。【F:CampusCalendar/Views/Calendar/DayCardView.swift†L386-L405】

### 1.2 休祝日の背景処理
- 週カレンダーのカードは日曜または学事情報が休日のときに淡いグレー（`restDayBackgroundColor`）の背景を敷く。授業日であっても休日扱いのローカルデータが優先される。【F:CampusCalendar/Views/Calendar/DayCardView.swift†L48-L65】
- 月間カレンダーも同じ判定を`MonthlyCalendarViewModel`内で行い、該当日にはグレー背景を返す。今日の日付は`MyPrimaryContainer`で別途強調される。【F:CampusCalendar/Views/ViewModels/MonthlyCalendarViewModel.swift†L198-L207】【F:CampusCalendar/Views/ViewModels/MonthlyCalendarViewModel.swift†L396-L414】【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L200-L259】
- ホーム画面のクイック日付ボタンでは、選択状態と今日の判定に加え、学事種別に応じて背景色を変える。休日はグレー、試験日は`examAccent`の半透明、授業系は白背景を用いる。【F:CampusCalendar/Views/Dashboard/DashboardView.swift†L560-L583】

### 1.3 曜日インジケータ
- 月間カレンダーのヘッダーは曜日ごとに固定色を割り当てており、月曜から日曜までをオレンジ〜赤の原色帯で表示する。【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L27-L47】【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L488-L505】
- 各日セルの右上には`weekdayIndicator`が描画され、授業日に設定された学事用曜日に応じた色付きドットまたは授業回数ラベルを表示する。授業回数が設定されていれば同色の長方形に回数を描く。【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L420-L439】【F:CampusCalendar/Views/ViewModels/MonthlyCalendarViewModel.swift†L209-L269】

## 2. 大学学事予定に基づく表示
### 2.1 学事情報の解釈と整形
- `CalendarDayHeaderFormatter`は学期略称（`term_short_name`）、授業曜日（`class_weekday`）、授業回数（`class_order`）を組み合わせて詳細ラベルを生成する。授業曜日はローカル値があればそれを優先し、無い場合は実際の日付から曜日を補完する。授業回数は正の整数に丸めて採用する。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L99-L227】
- 試験日は「学期名＋試験」形式、休日は説明文や祝日名称、学期名の優先順位でラベル化される。通知理由に「特別授業日」「曜日振替」などが含まれる場合は太字強調フラグが立つ。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L99-L155】【F:CampusCalendar/CalendarNotificationReason.swift†L1-L37】
- 週・日表示ではConvex由来の`CalendarDay`に変換した上で、同様のフォーマット関数を用いて表示文を決定する。【F:CampusCalendar/Views/Calendar/DayDetailView.swift†L377-L506】【F:CampusCalendar/Views/Dashboard/DashboardView.swift†L937-L1037】

### 2.2 広い領域での学事表示（ホーム／週カレンダー／日詳細）
- ホーム画面と日詳細画面のヘッダ背景色は学事種別に応じて切り替わる。休日はグレー、試験日は`examAccent`の淡色、授業・予備日・未指定は`MySecondaryContainer`を使用する。【F:CampusCalendar/Views/Dashboard/DashboardView.swift†L922-L935】【F:CampusCalendar/Views/Calendar/DayDetailView.swift†L362-L374】
- 週カレンダーのカード詳細ラベルは`CalendarDayHeaderFormatter`の結果を表示し、種別別にテキスト色と背景（カプセル）を調整する。授業・予備日は素のテキスト、休日は黒字＋グレー背景、試験日は`examAccent`文字＋半透明背景、未指定はセカンダリ色を用いる。【F:CampusCalendar/Views/Calendar/DayCardView.swift†L386-L505】
- ホーム／日詳細ヘッダの右側ラベルも同じルールで色を決定し、必要に応じて通知理由（例：曜日振替）を強調表示する。【F:CampusCalendar/Views/Dashboard/DashboardView.swift†L937-L999】【F:CampusCalendar/Views/Calendar/DayDetailView.swift†L377-L456】【F:CampusCalendar/CalendarNotificationReason.swift†L18-L37】
- クイック日付ボタンも学事種別に応じた背景色で状態を示し、同時に祝日・週末判定で文字色を切り替えることで、大学独自の休日と一般的な週末を区別しやすくする。【F:CampusCalendar/Views/Dashboard/DashboardView.swift†L560-L583】

### 2.3 狭い領域での学事表示（月間カレンダー等）
- 月間カレンダーのセルでは、日付テキスト色に`CalendarDayHeaderFormatter`のアクセント色を流用しつつ、学事種別に応じたインジケータと背景色を重ねる。祝日・日曜はグレー背景、試験日はヘッダ先頭に`examAccent`のバーが表示される。【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L200-L259】【F:CampusCalendar/Views/ViewModels/MonthlyCalendarViewModel.swift†L198-L414】
- 授業日の場合は`class_weekday`を正規化して曜日別カラーパレットに変換し、ドットまたは授業回数バッジを表示する。授業回数は`class_order`を丸めた正の整数のみ利用する。【F:CampusCalendar/Views/Calendar/MonthlyCalendarView.swift†L420-L439】【F:CampusCalendar/Views/ViewModels/MonthlyCalendarViewModel.swift†L209-L269】【F:CampusCalendar/Views/ViewModels/MonthlyCalendarViewModel.swift†L416-L435】
- `term_short_name`や学期名称はセル右上の授業バッジではなく、必要に応じて詳細モーダル（DayDetailView）や週カードヘッダで表示され、月間セルでは曜日・回数のシグナルに限定して情報量を抑えている。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L136-L157】【F:CampusCalendar/Views/Calendar/DayCardView.swift†L386-L426】

### 2.4 通知理由と強調表示
- `notification_reasons`に設定された値を`CalendarNotificationReasonParser`が解釈し、休日振替や特別授業日に該当すると詳細テキストを太字にする。週カードや日詳細ヘッダでも同じ判定を用いて注意喚起を行っている。【F:CampusCalendar/Views/Components/CalendarDayHeaderFormatter.swift†L131-L134】【F:CampusCalendar/CalendarNotificationReason.swift†L18-L37】【F:CampusCalendar/Views/Calendar/DayCardView.swift†L407-L425】

## まとめ
- 一般カレンダー要素（曜日色・休祝日背景）は`CalendarDayHeaderFormatter`と各ビューの共通ロジックで一貫管理されており、Firestore移行時も同じ判定ルールを再現する必要がある。
- 学事予定は`calendar_days`のローカルデータを基に整形され、広い領域では学期・曜日・回数を文章やバッジとして表示、狭い領域では曜日色と回数バッジでコンパクトに表現する。Firestoreでも同等のフィールド構成とフォーマッタ層が求められる。
