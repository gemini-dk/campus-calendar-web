import Link from 'next/link';

export default function GlobalFooter() {
  return (
    <footer className="w-full bg-slate-900 text-white ">
      <div className="mx-auto max-w-7xl px-4 py-4 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 justify-items-center text-center md:text-left">
          {/* 左側：Campus Calendar */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Campus Calendar</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="https://campus-calendar.jp"
                  className="text-slate-300 hover:text-white transition-colors duration-200"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ホーム
                </Link>
              </li>
              <li>
                <Link
                  href="https://campus-calendar.launchfy.site/ja/faq"
                  className="text-slate-300 hover:text-white transition-colors duration-200"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link
                  href="/mobile"
                  className="text-slate-300 hover:text-white transition-colors duration-200"
                  rel="noopener noreferrer"
                >
                  Webアプリ
                </Link>
              </li>              
            </ul>
          </div>

          {/* 右側：Support */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Support</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="https://campus-calendar.launchfy.site/ja/form"
                  className="text-slate-300 hover:text-white transition-colors duration-200"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  お問い合わせ
                </Link>
              </li>
              <li>
                <Link
                  href="https://campus-calendar.launchfy.site/ja/terms-of-use"
                  className="text-slate-300 hover:text-white transition-colors duration-200"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ユーザ利用規約
                </Link>
              </li>
              <li>
                <Link
                  href="https://campus-calendar.launchfy.site/ja/page/privacy-policy"
                  className="text-slate-300 hover:text-white transition-colors duration-200"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  プライバシーポリシー
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* 最下部：コピーライト */}
        <div className="mt-4 border-t border-slate-700 pt-2">
          <p className="text-center text-sm text-slate-400">
            ©2025 BrainApp
          </p>
        </div>
      </div>
    </footer>
  );
}
