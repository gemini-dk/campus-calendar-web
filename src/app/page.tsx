'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, type User } from 'firebase/auth';
import { CalendarImportDialog } from '@/components/calendar/CalendarImportDialog';
import { auth, googleProvider } from '@/lib/firebase';
import { type CalendarImportSummary } from '@/lib/calendarImporter';

type MainTab = 'home' | 'calendar' | 'tasks' | 'classes';

type SubTabSelection = Record<MainTab, string>;

type HomeRenderContext = {
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
  handleGoogleSignIn: () => Promise<void>;
  currentUser: User | null;
  onOpenImporter: () => void;
  importSummary: CalendarImportSummary | null;
};

const MAIN_TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'calendar', label: 'カレンダー', Icon: CalendarIcon },
  { id: 'tasks', label: '課題・メモ', Icon: TasksIcon },
  { id: 'classes', label: '授業管理', Icon: ClassesIcon },
] as const;

const SUB_TAB_OPTIONS: Record<MainTab, { id: string; label: string }[]> = {
  home: [{ id: 'overview', label: 'Home' }],
  calendar: [
    { id: 'weekly', label: '週次' },
    { id: 'monthly', label: '月次' },
  ],
  tasks: [
    { id: 'assignments', label: '課題' },
    { id: 'memos', label: 'メモ' },
  ],
  classes: [
    { id: 'timetable', label: '時間割' },
    { id: 'list', label: '授業一覧' },
  ],
};

const VIEW_META: Record<
  MainTab,
  Record<
    string,
    {
      title: string;
      description: string[];
    }
  >
> = {
  home: {
    overview: {
      title: 'Home',
      description: ['今日の授業、課題登録、出欠管理', '今すぐ必要な機能は全てここに'],
    },
  },
  calendar: {
    weekly: {
      title: 'Weekly Calendar',
      description: ['今週締切の課題は？', 'サークルは？ バイトは？'],
    },
    monthly: {
      title: 'Monthly Calendar',
      description: ['授業、休暇、試験', '大学の予定が一目でわかる'],
    },
  },
  tasks: {
    assignments: {
      title: 'Activities',
      description: ['出欠、課題、授業メモ', '授業ごとに確認できます'],
    },
    memos: {
      title: 'Activities',
      description: ['授業メモをその場で整理', '重要な気づきを逃さない'],
    },
  },
  classes: {
    timetable: {
      title: 'Timetable',
      description: ['授業は時間割形式でも確認できます'],
    },
    list: {
      title: 'Class Library',
      description: ['履修科目をまとめて管理', '資料や教室情報も一箇所に'],
    },
  },
};

export default function Home() {
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('home');
  const [subTabs, setSubTabs] = useState<SubTabSelection>({
    home: 'overview',
    calendar: 'weekly',
    tasks: 'assignments',
    classes: 'timetable',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<CalendarImportSummary | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setImportSummary(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setIsImporterOpen(false);
    }
  }, [currentUser]);

  const subOptions = SUB_TAB_OPTIONS[activeMainTab];
  const currentSubTab = subTabs[activeMainTab];
  const viewMeta = getViewMeta(activeMainTab, currentSubTab);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const displayName = result.user.displayName ?? 'ゲスト';
      setSuccessMessage(`${displayName} さんとしてサインインしました。`);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('予期せぬエラーが発生しました。しばらく待ってから再度お試しください。');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenImporter = () => {
    if (!currentUser) {
      return;
    }
    setError(null);
    setIsImporterOpen(true);
  };

  const handleImporterSuccess = (summary: CalendarImportSummary) => {
    setImportSummary(summary);
    setSuccessMessage(`${summary.calendarName} の取り込みが完了しました。`);
    setIsImporterOpen(false);
  };

  const handleSelectMainTab = (tab: MainTab) => {
    setActiveMainTab(tab);
  };

  const handleSelectSubTab = (value: string) => {
    setSubTabs((prev) => ({
      ...prev,
      [activeMainTab]: value,
    }));
  };

  const content = renderView(activeMainTab, currentSubTab, {
    isLoading,
    error,
    successMessage,
    handleGoogleSignIn,
    currentUser,
    onOpenImporter: handleOpenImporter,
    importSummary,
  });

  return (
    <div className="flex min-h-screen w-full justify-center bg-gradient-to-b from-sky-800 via-blue-800 to-slate-900 px-4 py-10 text-white">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] border border-white/15 bg-white/10 shadow-[0_40px_80px_-40px_rgba(6,29,61,0.9)] backdrop-blur-xl">
        <header className="px-8 pt-10">
          <h1 className="text-4xl font-bold tracking-tight text-white">{viewMeta.title}</h1>
          <div className="mt-3 space-y-1 text-sm text-white/85">
            {viewMeta.description.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </header>

        {subOptions.length > 1 ? (
          <div className="px-8 pb-4 pt-6">
            <CapsuleSwitch
              options={subOptions}
              value={currentSubTab}
              onChange={handleSelectSubTab}
            />
          </div>
        ) : (
          <div className="h-6" />
        )}

        <div className="flex flex-1 flex-col px-6">
          <div className="flex flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/45 px-6 py-6 shadow-inner shadow-black/40">
            <main className="flex-1 overflow-y-auto">
              <div className="space-y-6">{content}</div>
            </main>
          </div>
        </div>

        <BottomNav activeTab={activeMainTab} onSelect={handleSelectMainTab} />
      </div>

      {isImporterOpen && currentUser ? (
        <CalendarImportDialog
          userId={currentUser.uid}
          onClose={() => setIsImporterOpen(false)}
          onImported={handleImporterSuccess}
        />
      ) : null}
    </div>
  );
}

function renderView(mainTab: MainTab, subTab: string, context: HomeRenderContext) {
  switch (mainTab) {
    case 'home':
      return (
        <HomeContent
          isLoading={context.isLoading}
          error={context.error}
          successMessage={context.successMessage}
          onGoogleSignIn={context.handleGoogleSignIn}
          currentUser={context.currentUser}
          onOpenImporter={context.onOpenImporter}
          importSummary={context.importSummary}
        />
      );
    case 'calendar':
      return subTab === 'monthly' ? <CalendarMonthlyContent /> : <CalendarWeeklyContent />;
    case 'tasks':
      return subTab === 'memos' ? <MemoContent /> : <AssignmentsContent />;
    case 'classes':
      return subTab === 'list' ? <ClassListContent /> : <TimetableContent />;
    default:
      return null;
  }
}

function HomeContent(props: {
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
  onGoogleSignIn: () => Promise<void>;
  currentUser: User | null;
  onOpenImporter: () => void;
  importSummary: CalendarImportSummary | null;
}) {
  const todaysClasses = [
    { name: '代数学基礎', slot: '1限 / Zoom', attendance: '7 / 20', status: '出席' },
    { name: 'ゲーム理論', slot: '3限 / S204', attendance: '3 / 12', status: '欠席 1' },
  ];

  const todaysTasks = [
    { title: '10/03 の授業で出題された課題', due: '期限 10/10', course: '代数学基礎' },
    { title: 'レポート: ゲーム理論 第4章', due: '期限 10/12', course: 'ゲーム理論' },
  ];

  return (
    <>
      <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
        <h2 className="text-lg font-semibold text-white">学事予定の取り込み</h2>
        <p className="mt-2 text-sm text-white/85">
          Convex で公開されている大学の学事予定を Firestore に取り込みます。
        </p>
        <button
          type="button"
          onClick={props.onOpenImporter}
          disabled={!props.currentUser}
          className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {props.currentUser ? '大学を検索する' : 'サインインして取り込みを開始'}
        </button>
        {props.currentUser ? (
          <p className="mt-3 text-xs text-white/70">
            サインイン済み: {props.currentUser.displayName ?? props.currentUser.email ?? 'Google アカウント'}
          </p>
        ) : (
          <p className="mt-3 text-xs text-white/60">Google サインインすると利用できます。</p>
        )}
        {props.importSummary ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-4 text-xs text-emerald-50">
            <p className="text-sm font-semibold text-emerald-100">{props.importSummary.calendarName}</p>
            <p className="mt-2">
              日付 {props.importSummary.dayCount} 件 / 学期 {props.importSummary.termCount} 件 /
              キャンパス {props.importSummary.campusCount} 件を取り込みました。
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
        <h2 className="text-lg font-semibold text-white">今日の授業</h2>
        <ul className="mt-4 space-y-3 text-sm text-white/85">
          {todaysClasses.map((item) => (
            <li
              key={item.name}
              className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3"
            >
              <div>
                <p className="font-medium text-white">{item.name}</p>
                <p className="mt-1 text-xs text-white/70">{item.slot}</p>
              </div>
              <div className="text-right text-xs">
                <p className="rounded-full bg-emerald-400/15 px-2 py-1 text-emerald-200">
                  出席 {item.attendance}
                </p>
                <p className="mt-2 text-[11px] text-white/60">{item.status}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
        <h2 className="text-lg font-semibold text-white">今日の予定</h2>
        <p className="mt-2 text-sm text-white/85">15:00 - 19:00 まるかわテニスコート</p>
        <p className="mt-1 rounded-full bg-indigo-400/20 px-3 py-1 text-xs text-indigo-100">
          テニス / アプリから追加
        </p>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
        <h2 className="text-lg font-semibold text-white">課題とメモ</h2>
        <ul className="mt-4 space-y-3 text-sm text-white/85">
          {todaysTasks.map((task) => (
            <li key={task.title} className="rounded-2xl bg-white/5 px-4 py-3">
              <p className="font-medium text-white">{task.title}</p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="rounded-full bg-amber-400/30 px-2 py-1 text-amber-100">
                  {task.due}
                </span>
                <span className="text-white/70">{task.course}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
        <h2 className="text-lg font-semibold text-white">Google サインイン</h2>
        <p className="mt-2 text-sm text-white/85">
          課題や出欠記録をクラウドに保存するには Google アカウントが必要です。
        </p>
        <button
          type="button"
          onClick={props.onGoogleSignIn}
          disabled={props.isLoading}
          className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-75"
        >
          <GoogleIcon />
          {props.isLoading ? 'サインイン処理中…' : 'Google でサインイン'}
        </button>

        {props.error ? (
          <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-xs text-red-100">
            {props.error}
          </p>
        ) : null}

        {props.successMessage ? (
          <p className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-400/15 px-4 py-3 text-xs text-emerald-50">
            {props.successMessage}
          </p>
        ) : null}
      </section>
    </>
  );
}

function CalendarWeeklyContent() {
  const week = [
    { day: 'Mon', date: '6', focus: '中国語Ⅱ', badge: '秋A 月 (1)', extra: '18:00 バイト' },
    { day: 'Tue', date: '7', focus: 'ダロー・バド…', badge: '秋A 火 (1)', extra: '課題 1 件' },
    { day: 'Wed', date: '8', focus: 'ゲーム理論', badge: '秋A 水 (2)', extra: 'S204 / 実験' },
    { day: 'Thu', date: '9', focus: '中国語Ⅱ', badge: '秋A 木 (2)', extra: '課題 1 件' },
    { day: 'Fri', date: '10', focus: '代数学基礎', badge: '秋A 金 (2)', extra: '15:00 テニス' },
    { day: 'Sat', date: '11', focus: 'Off', badge: '秋A 土 (2)', extra: 'イベント 1 件' },
    { day: 'Sun', date: '12', focus: '同好会オフ会', badge: '秋A 日 (2)', extra: '終日' },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
      <header className="flex items-center justify-between text-sm text-white/70">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">October 2025</p>
          <p className="text-lg font-semibold text-white">10/6 - 10/12 (10/8)</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <CalendarBadge icon="7" label="週" />
          <CalendarBadge icon="31" label="月" />
        </div>
      </header>

      <ul className="mt-6 grid grid-cols-2 gap-4 text-sm text-white/85">
        {week.map((item) => (
          <li key={item.day} className="rounded-2xl bg-white/5 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-semibold text-white">{item.date}</p>
              <span className="text-xs uppercase tracking-widest text-white/60">{item.day}</span>
            </div>
            <p className="mt-3 font-medium text-white">{item.focus}</p>
            <p className="mt-2 text-[11px] text-white/60">{item.badge}</p>
            <p className="mt-3 rounded-full bg-indigo-400/25 px-2 py-1 text-[11px] text-indigo-100">
              {item.extra}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CalendarMonthlyContent() {
  const weeks = [
    { days: ['1', '2', '3', '4', '5', '6', '7'] },
    { days: ['8', '9', '10', '11', '12', '13', '14'] },
    { days: ['15', '16', '17', '18', '19', '20', '21'] },
    { days: ['22', '23', '24', '25', '26', '27', '28'] },
    { days: ['29', '30', '31', '', '', '', ''] },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
      <header className="flex items-center justify-between text-sm text-white/70">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">December 2025</p>
          <p className="text-lg font-semibold text-white">12/1 - 12/31 (12/31)</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <CalendarBadge icon="7" label="週" />
          <CalendarBadge icon="31" label="月" active />
        </div>
      </header>

      <div className="mt-6 space-y-3 rounded-2xl bg-white/5 p-4 text-xs text-white/70">
        <div className="grid grid-cols-7 gap-2 text-[11px] uppercase tracking-widest text-white/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        {weeks.map((week, index) => (
          <div key={index} className="grid grid-cols-7 gap-2">
            {week.days.map((day, idx) => (
              <div
                key={`${index}-${idx}`}
                className={cn(
                  'aspect-square rounded-xl border border-white/5 px-2 py-2 text-[11px]',
                  day === '22' ? 'bg-amber-400/20 text-white' : 'bg-white/5 text-white/70'
                )}
              >
                {day ? (
                  <div className="flex h-full flex-col justify-between">
                    <span className="font-semibold text-white">{day}</span>
                    <span className="text-[10px] text-white/60">
                      {day === '5' ? 'テニス' : day === '22' ? '家庭教師' : '授業'}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function AssignmentsContent() {
  const assignments = [
    {
      title: '代数学基礎 - 10/10 期限',
      status: '進行中',
      progress: 0.35,
    },
    {
      title: '中国語Ⅱ - 単語テスト対策',
      status: 'メモ追加済み',
      progress: 0.75,
    },
    {
      title: 'ゲーム理論 - 第4章レポート',
      status: '未着手',
      progress: 0.15,
    },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
      <header className="flex items-center justify-between text-sm text-white/70">
        <p className="font-semibold text-white">アクティビティ記録</p>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">3 件</span>
      </header>

      <ul className="mt-4 space-y-4 text-sm text-white/85">
        {assignments.map((assignment) => (
          <li key={assignment.title} className="rounded-2xl bg-white/5 p-4">
            <p className="font-medium text-white">{assignment.title}</p>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="rounded-full bg-emerald-400/20 px-2 py-1 text-emerald-100">
                {assignment.status}
              </span>
              <span className="text-white/60">{Math.round(assignment.progress * 100)}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${assignment.progress * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MemoContent() {
  const memos = [
    {
      title: '代数学基礎 / 10月10日',
      highlight: '既約因子の定義と例',
      nextAction: '次回までに演習問題 3 を解く',
    },
    {
      title: 'ゲーム理論 / 10月08日',
      highlight: '囚人のジレンマ応用例',
      nextAction: '講義資料 45 ページを再読',
    },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
      <header className="flex items-center justify-between text-sm text-white/70">
        <p className="font-semibold text-white">授業メモ</p>
        <button
          type="button"
          className="rounded-full bg-white/10 px-4 py-1 text-xs font-semibold text-white hover:bg-white/20"
        >
          メモを追加
        </button>
      </header>

      <ul className="mt-4 space-y-4 text-sm text-white/85">
        {memos.map((memo) => (
          <li key={memo.title} className="rounded-2xl bg-white/5 p-4">
            <p className="font-medium text-white">{memo.title}</p>
            <p className="mt-2 text-xs text-white/70">ハイライト</p>
            <p className="mt-1 text-sm text-white">{memo.highlight}</p>
            <p className="mt-3 text-xs text-white/70">次のアクション</p>
            <p className="mt-1 text-sm text-white">{memo.nextAction}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TimetableContent() {
  const schedule = [
    { day: 'Mon', slots: [{ name: 'グローバル社会', room: 'W234' }] },
    { day: 'Tue', slots: [{ name: 'ゲーム理論', room: 'S204' }] },
    { day: 'Wed', slots: [{ name: '基礎化学実験', room: 'Lab' }] },
    { day: 'Thu', slots: [{ name: '中国語Ⅱ', room: '5503' }] },
    { day: 'Fri', slots: [{ name: '代数学基礎', room: 'Zoom' }] },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
      <header className="flex items-center justify-between text-sm text-white/70">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">2025 年度</p>
          <p className="text-lg font-semibold text-white">秋学期 A</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <CapsuleTag active>時間割</CapsuleTag>
          <CapsuleTag>一覧</CapsuleTag>
        </div>
      </header>

      <div className="mt-6 space-y-3 rounded-2xl bg-white/5 p-4 text-sm text-white/85">
        {schedule.map((column) => (
          <div key={column.day} className="rounded-2xl bg-white/5 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-white">{column.day}</p>
              <span className="text-xs text-white/60">秋学期 A</span>
            </div>
            <ul className="mt-3 space-y-2 text-xs text-white/80">
              {column.slots.map((slot) => (
                <li key={slot.name} className="rounded-2xl bg-white/10 px-3 py-2">
                  <p className="font-semibold text-white">{slot.name}</p>
                  <p className="text-white/60">{slot.room}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ClassListContent() {
  const classes = [
    { name: '代数学基礎', teacher: '木村 淳', mode: 'オンライン / Zoom' },
    { name: 'ゲーム理論', teacher: '佐藤 一樹', mode: '対面 / S204' },
    { name: '中国語Ⅱ', teacher: '李 芳', mode: '対面 / 5503' },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
      <header className="flex items-center justify-between text-sm text-white/70">
        <p className="font-semibold text-white">履修中の授業</p>
        <button
          type="button"
          className="rounded-full bg-white/10 px-4 py-1 text-xs font-semibold text-white hover:bg-white/20"
        >
          授業を追加
        </button>
      </header>

      <ul className="mt-4 space-y-3 text-sm text-white/85">
        {classes.map((course) => (
          <li key={course.name} className="rounded-2xl bg-white/5 p-4">
            <p className="font-medium text-white">{course.name}</p>
            <p className="mt-1 text-xs text-white/70">{course.mode}</p>
            <p className="mt-2 text-xs text-white/60">担当: {course.teacher}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BottomNav(props: { activeTab: MainTab; onSelect: (tab: MainTab) => void }) {
  return (
    <nav className="px-6 pb-6 pt-5">
      <div className="grid grid-cols-4 gap-3 rounded-full border border-white/15 bg-slate-950/50 p-2">
        {MAIN_TABS.map((tab) => {
          const isActive = props.activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => props.onSelect(tab.id)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition',
                isActive
                  ? 'bg-white text-slate-900 shadow-lg shadow-slate-900/30'
                  : 'text-white/70 hover:text-white'
              )}
            >
              <tab.Icon className={cn('h-5 w-5', isActive ? 'text-slate-900' : 'text-white/70')} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CapsuleSwitch(props: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex rounded-full bg-white/15 p-1 text-sm font-medium text-white/70">
        {props.options.map((option) => {
          const isActive = option.id === props.value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => props.onChange(option.id)}
              className={cn(
                'rounded-full px-5 py-2 transition',
                isActive ? 'bg-white text-slate-900 shadow' : 'hover:text-white'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarBadge(props: { icon: string; label: string; active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs',
        props.active ? 'bg-white text-slate-900' : 'bg-white/10 text-white/80'
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/50 text-[11px]">
        {props.icon}
      </span>
      {props.label}
    </span>
  );
}

function CapsuleTag(props: { children: string; active?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold',
        props.active ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70'
      )}
    >
      {props.children}
    </span>
  );
}

function HomeIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
      <path d="M10 20v-4h4v4" />
    </svg>
  );
}

function CalendarIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M16 3v3" />
      <path d="M8 3v3" />
      <path d="M3 9.5h18" />
      <path d="M8 13h3" />
      <path d="M13 13h3" />
      <path d="M8 17h3" />
    </svg>
  );
}

function TasksIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M4 5h8" />
      <path d="M4 9h6" />
      <path d="m4 13 2.5 2.5L10 12" />
      <path d="M12 5h8" />
      <path d="M12 9h8" />
      <path d="M12 13h8" />
      <path d="M12 17h8" />
    </svg>
  );
}

function ClassesIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 18v2.5L12 18l5 2.5V18" />
      <path d="M7 8h10" />
      <path d="M7 12h6" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.35 11.1H12v2.92h5.35c-.23 1.23-.93 2.27-1.98 2.96v2.45h3.2c1.87-1.72 2.95-4.25 2.95-7.24 0-.7-.06-1.38-.17-2.03Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.62-2.45l-3.2-2.45c-.9.6-2.05.96-3.42.96a5.94 5.94 0 0 1-5.64-4.12H3.04v2.54A9.99 9.99 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.36 13.94A5.97 5.97 0 0 1 6.04 12c0-.68.12-1.34.32-1.94V7.52H3.04A10 10 0 0 0 2 12c0 1.6.38 3.12 1.04 4.48l3.32-2.54Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.06c1.47 0 2.8.5 3.84 1.48l2.88-2.88C16.96 2.9 14.7 2 12 2 8.13 2 4.79 4.24 3.04 7.52l3.32 2.54A5.95 5.95 0 0 1 12 6.06Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function getViewMeta(mainTab: MainTab, subTab: string) {
  const record = VIEW_META[mainTab];
  return record[subTab] ?? { title: 'Coming Soon', description: [] };
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
