"use client"; // フック(useStateなど)を使うのでクライアントコンポーネントにします

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";

interface HistoryRecord {
  id: string;
  date: string;
  inTime: string;
  outTime: string;
  duration: string;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [qrToken, setQrToken] = useState<string>("");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [summary, setSummary] = useState<{ monthlyTotal: string; monthlyDays: number; weeklyDays: number; monthLabel: string } | null>(null);

  // 現在時刻（時計アニメーション ＋ 制限時間計算用）
  const [now, setNow] = useState<Date>(new Date());

  // 許可リクエスト用ステータス
  const [requestStatus, setRequestStatus] = useState<'idle' | 'form' | 'loading' | 'success' | 'error'>('idle');
  const [requestValidFrom, setRequestValidFrom] = useState<string>("");
  const [requestValidUntil, setRequestValidUntil] = useState<string>("");
  const [requestError, setRequestError] = useState<string>("");

  // 保護者メール変更用
  const [emailChangeStatus, setEmailChangeStatus] = useState<'idle' | 'form' | 'loading' | 'success' | 'error'>('idle');
  const [newParentEmail, setNewParentEmail] = useState<string>("");
  const [emailChangeError, setEmailChangeError] = useState<string>("");

  const handleRequestPermission = async () => {
    setRequestStatus('loading');
    setRequestError('');
    try {
      const res = await fetch("/api/user/request-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validFrom: requestValidFrom, validUntil: requestValidUntil })
      });
      if (res.ok) {
        setRequestStatus('success');
      } else {
        const errorData = await res.json();
        setRequestError(errorData.error || '不明なエラーが発生しました');
        setRequestStatus('error');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setRequestError(error.message || 'ネットワークエラーが発生しました');
      } else {
        setRequestError('ネットワークエラーが発生しました');
      }
      setRequestStatus('error');
    }
  };

  const getMaxDate = () => {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return `${m >= 4 ? y + 1 : y}-03-31`;
  };
  const maxDateStr = getMaxDate();

  // 混雑状況用
  const [occupiedCount, setOccupiedCount] = useState<number>(0);
  const [totalSeats, setTotalSeats] = useState<number>(30);

  // 時計の更新（毎秒）
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ログインしていない場合や未登録の場合のチェック
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/api/auth/signin");
    } else if (status === "authenticated" && session?.user?.isRegistered === false) {
      router.push("/register");
    }
  }, [status, session, router]);

  // 30秒ごとに新しいQRコード用トークンと混雑状況を取得する関数
  const fetchData = async () => {
    try {
      // QRトークンの取得
      const resQr = await fetch("/api/qr");
      const dataQr = await resQr.json();
      if (dataQr.token) {
        setQrToken(dataQr.token);
      }

      // 混雑状況の取得
      const resSeats = await fetch("/api/seats");
      const dataSeats = await resSeats.json();
      if (dataSeats.occupiedSeats) {
        setOccupiedCount(dataSeats.occupiedSeats.length);
      }
      // レイアウトから総座席数を計算
      if (dataSeats.layout) {
        const count = dataSeats.layout.flat().filter((s: string | null) => s !== null).length;
        if (count > 0) setTotalSeats(count);
      }
    } catch (error) {
      console.error("データ取得エラー:", error);
    }
  };

  // 初回表示時と、その後30秒ごとに実行
  useEffect(() => {
    if (status === "authenticated") {
      fetchData();
      const interval = setInterval(fetchData, 30000); // 30秒ごと
      return () => clearInterval(interval);
    }
  }, [status]);

  // 一般生徒の場合、自身の履歴を取得
  useEffect(() => {
    if (status === "authenticated" && !session?.user?.isAdmin) {
      const fetchHistory = async () => {
        try {
          const res = await fetch("/api/user/history");
          const data = await res.json();
          if (data.history) setHistory(data.history);
          if (data.summary) setSummary(data.summary);
        } catch (error) {
          console.error("履歴の取得に失敗しました:", error);
        } finally {
          setLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [status, session]);

  if (status === "loading") {
    return <div className="flex justify-center items-center min-h-screen bg-gray-900 text-white">読み込み中...</div>;
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white px-6">
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center border border-gray-700">
          <div className="text-5xl mb-4">🏫</div>
          <h1 className="text-2xl font-bold mb-2">入退室システム</h1>
          <p className="text-gray-400 text-sm mb-6">自習室の入退室を管理するシステムです</p>

          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 mb-6">
            <p className="text-yellow-300 text-xs font-bold mb-1">⚠ ログインについて</p>
            <p className="text-yellow-200/80 text-xs leading-relaxed">
              <strong>学校から配布されたGoogleアカウント</strong>（@{process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "学校ドメイン"}）でログインしてください。<br />個人のGmailではログインできません。
            </p>
          </div>

          <button
            onClick={() => {
              import("next-auth/react").then(({ signIn }) => signIn("google"));
            }}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-bold py-3 px-6 rounded-lg hover:bg-gray-100 transition-colors shadow-md"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Googleでログイン
          </button>

          <p className="text-gray-500 text-[10px] mt-4">新潟明訓高校 パソコン部</p>
        </div>
      </div>
    );
  }

  // 利用期間の判定
  const validFrom = session.user.validFrom ? new Date(session.user.validFrom) : null;
  const validUntil = session.user.validUntil ? new Date(session.user.validUntil) : null;
  const isOutOfPeriod = (validFrom && now < validFrom) || (validUntil && now > validUntil);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white text-black">
      <h1 className="text-2xl font-bold mb-4">
        こんにちは、{session.user.name || session.user.studentId}さん
      </h1>

      <div className="bg-gray-100 p-4 rounded-lg mb-8 text-center">
        <p className="text-sm text-gray-600 mb-1">現在のステータス</p>
        <p className={`text-2xl font-bold ${session.user.currentStatus === "IN" ? "text-green-600" : "text-gray-500"}`}>
          {session.user.currentStatus === "IN" ? "在室 (IN)" : "退室 (OUT)"}
        </p>
      </div>

      {/* コンテンツ表示エリア (管理者 vs 生徒) */}
      {session.user.isAdmin ? (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mb-8 flex flex-col gap-4 w-full max-w-sm">
          <p className="text-center text-gray-700 font-semibold mb-2">管理者メニュー</p>
          <Link
            href="/admin"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded shadow text-center transition-colors"
          >
            🖥️ 管理ダッシュボードを開く
          </Link>
          <Link
            href="/scanner"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-4 rounded shadow text-center transition-colors"
          >
            📱 QRスキャナーを開く
          </Link>
        </div>
      ) : (
        <div className="w-full max-w-sm flex flex-col items-center">
          {/* 混雑状況メーター */}
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mb-6 w-full text-center">
            <h2 className="text-gray-600 text-sm font-semibold mb-2">現在の自習室の混雑状況</h2>
            <div className="flex justify-between items-end mb-1">
              <span className="text-2xl font-bold text-gray-800">{occupiedCount} <span className="text-sm font-normal text-gray-500">/ {totalSeats} 人</span></span>
              <span className="text-sm font-bold text-blue-600">{Math.round((occupiedCount / totalSeats) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-1 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${(occupiedCount / totalSeats) > 0.8 ? 'bg-red-500' :
                  (occupiedCount / totalSeats) > 0.5 ? 'bg-yellow-400' : 'bg-green-500'
                  }`}
                style={{ width: `${Math.min((occupiedCount / totalSeats) * 100, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-right">※30秒ごとに自動更新</p>
          </div>

          {/* QRコード表示エリア */}
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mb-8 flex flex-col items-center w-full relative overflow-hidden">
            {isOutOfPeriod ? (
              <div className="flex flex-col items-center justify-center p-8 bg-red-50 text-red-600 rounded-lg border border-red-200 w-full min-h-[250px] text-center">
                <p className="text-4xl mb-4">🚫</p>
                <p className="font-bold text-lg mb-2">現在は利用期間外です</p>
                <p className="text-xs text-red-500 mb-6">
                  {validFrom && now < validFrom ? `利用開始: ${validFrom.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} から` : ""}
                  {validUntil && now > validUntil ? `利用期限: ${validUntil.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} で終了しました` : ""}
                </p>

                {requestStatus === 'idle' && (
                  <button
                    onClick={() => setRequestStatus('form')}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors shadow-sm"
                  >
                    保護者に利用許可をリクエストする
                  </button>
                )}
                {requestStatus === 'form' && (
                  <div className="w-full text-left mt-2">
                    <p className="text-sm font-bold text-gray-700 mb-2">希望する利用期間を入力してください：</p>
                    <div className="mb-2">
                      <label className="block text-xs text-gray-600">利用開始日</label>
                      <input type="date" max={maxDateStr} className="w-full border p-2 rounded text-black text-sm" value={requestValidFrom} onChange={e => setRequestValidFrom(e.target.value)} />
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs text-gray-600">利用終了日</label>
                      <input type="date" max={maxDateStr} className="w-full border p-2 rounded text-black text-sm" value={requestValidUntil} onChange={e => setRequestValidUntil(e.target.value)} />
                      <p className="text-[10px] text-gray-400 mt-1">※年度をまたぐ設定はできません（最長 {maxDateStr.replace(/-/g, '/')} まで）</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setRequestStatus('idle')} className="w-1/3 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-2 rounded text-sm transition-colors">キャンセル</button>
                      <button onClick={handleRequestPermission} className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-2 rounded text-sm transition-colors shadow-sm">リクエスト送信</button>
                    </div>
                  </div>
                )}
                {requestStatus === 'loading' && <p className="text-sm font-bold text-gray-500">送信中...</p>}
                {requestStatus === 'success' && <p className="text-sm font-bold text-green-600">保護者のメールアドレスに申請用リンクを送信しました！<br />保護者の方に設定をお願いしてください。</p>}
                {requestStatus === 'error' && (
                  <div className="mt-2 text-sm font-bold text-red-600 bg-red-100 p-3 rounded">
                    送信に失敗しました。<br /><span className="text-xs font-normal">詳細: {requestError}</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="relative p-2 rounded-lg bg-white z-10">
                  {/* アニメーションする枠線でスクショを防止 */}
                  <div className="absolute inset-0 border-4 border-transparent rounded-lg animate-[spin_5s_linear_infinite]"
                    style={{ backgroundImage: 'linear-gradient(white, white), conic-gradient(from 0deg, #3b82f6, #10b981, #f59e0b, #3b82f6)', backgroundOrigin: 'border-box', backgroundClip: 'content-box, border-box' }}>
                  </div>
                  <div className="relative bg-white p-2">
                    {qrToken ? (
                      <QRCodeSVG value={qrToken} size={200} level={"H"} />
                    ) : (
                      <div className="w-[200px] h-[200px] bg-gray-200 animate-pulse rounded"></div>
                    )}
                  </div>
                </div>

                {/* 秒単位のリアルタイム時計 */}
                <div className="mt-6 text-center font-mono w-full bg-gray-800 text-white py-2 rounded-lg shadow-inner">
                  <p className="text-xl font-bold tracking-widest">
                    {now.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">※この時計が止まっている画面は無効です</p>
                </div>
                <p className="text-xs text-gray-500 mt-4">QRコードは30秒自動更新</p>

                <div className="mt-6 border-t border-gray-100 pt-4 w-full text-center">
                  {requestStatus === 'idle' ? (
                    <button
                      onClick={() => setRequestStatus('form')}
                      className="text-xs text-blue-500 hover:text-blue-700 underline"
                    >
                      保護者に利用期間の延長・変更をリクエストする
                    </button>
                  ) : requestStatus === 'form' ? (
                    <div className="w-full text-left bg-gray-50 p-4 rounded mt-2 border border-gray-200">
                      <p className="text-sm font-bold text-gray-700 mb-2">希望する利用期間を入力してください</p>
                      <div className="mb-2">
                        <label className="block text-xs text-gray-600">利用開始日</label>
                        <input type="date" max={maxDateStr} className="w-full border p-2 rounded text-black text-sm" value={requestValidFrom} onChange={e => setRequestValidFrom(e.target.value)} />
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs text-gray-600">利用終了日</label>
                        <input type="date" max={maxDateStr} className="w-full border p-2 rounded text-black text-sm" value={requestValidUntil} onChange={e => setRequestValidUntil(e.target.value)} />
                        <p className="text-[10px] text-gray-400 mt-1">※年度をまたぐ設定はできません（最長 {maxDateStr.replace(/-/g, '/')} まで）</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setRequestStatus('idle')} className="w-1/3 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-2 rounded text-sm transition-colors">キャンセル</button>
                        <button onClick={handleRequestPermission} className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-2 rounded text-sm transition-colors shadow-sm">送信する</button>
                      </div>
                    </div>
                  ) : requestStatus === 'loading' ? (
                    <p className="text-xs text-gray-500">送信中...</p>
                  ) : requestStatus === 'success' ? (
                    <p className="text-xs text-green-600 font-bold">メールを送信しました</p>
                  ) : (
                    <p className="text-xs text-red-600">送信失敗: {requestError}</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 学習時間サマリー */}
          {summary && (
            <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-200 mb-6 w-full">
              <h2 className="text-sm font-bold text-gray-600 mb-3 text-center">📊 利用サマリー</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-blue-500 font-bold">{summary.monthLabel}の合計</p>
                  <p className="text-lg font-black text-blue-700">{summary.monthlyTotal}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-green-500 font-bold">{summary.monthLabel}の日数</p>
                  <p className="text-lg font-black text-green-700">{summary.monthlyDays}<span className="text-xs font-normal">日</span></p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-purple-500 font-bold">今週の日数</p>
                  <p className="text-lg font-black text-purple-700">{summary.weeklyDays}<span className="text-xs font-normal">日</span></p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mb-8 w-full">
            <h2 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">最近の利用履歴</h2>
            {loadingHistory ? (
              <p className="text-sm text-gray-500 text-center py-4">読み込み中...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">まだ履歴がありません</p>
            ) : (
              <ul className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {history.map((record, index) => (
                  <li key={record.id || index} className="text-sm flex flex-col bg-gray-50 p-3 rounded border border-gray-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-gray-700">{record.date}</span>
                      <span className="font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded text-xs">
                        {record.duration !== "-" ? record.duration : "計測中"}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-500 text-xs">
                      <span>IN: {record.inTime}</span>
                      <span>OUT: {record.outTime}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => signOut()}
        className="text-red-500 underline hover:text-red-700 text-sm mb-4"
      >
        ログアウト
      </button>

      {/* 保護者メール変更セクション（ログアウトボタンの下） */}
      {!session.user.isAdmin && (
        <div className="mt-2 mb-8 w-full max-w-sm text-center">
          {emailChangeStatus === 'idle' ? (
            <button
              onClick={() => setEmailChangeStatus('form')}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              保護者のメールアドレスを変更する
            </button>
          ) : emailChangeStatus === 'form' ? (
            <div className="bg-gray-50 p-4 rounded border border-gray-200 text-left">
              <p className="text-sm font-bold text-gray-700 mb-2">新しい保護者のメールアドレス</p>
              <input
                type="email"
                className="w-full border p-2 rounded text-black text-sm mb-2"
                placeholder="parent@example.com"
                value={newParentEmail}
                onChange={e => setNewParentEmail(e.target.value)}
              />
              <p className="text-[10px] text-gray-400 mb-3">※学校のメールアドレスは使用できません。新しいアドレスに確認メールが届きます。</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setEmailChangeStatus('idle'); setNewParentEmail(''); setEmailChangeError(''); }}
                  className="w-1/3 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-2 rounded text-sm"
                >キャンセル</button>
                <button
                  onClick={async () => {
                    setEmailChangeStatus('loading');
                    setEmailChangeError('');
                    try {
                      const res = await fetch('/api/user/change-parent-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newParentEmail })
                      });
                      if (res.ok) {
                        setEmailChangeStatus('success');
                      } else {
                        const data = await res.json();
                        setEmailChangeError(data.error || 'エラーが発生しました');
                        setEmailChangeStatus('error');
                      }
                    } catch {
                      setEmailChangeError('通信エラーが発生しました');
                      setEmailChangeStatus('error');
                    }
                  }}
                  className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-2 rounded text-sm"
                >確認メールを送信</button>
              </div>
            </div>
          ) : emailChangeStatus === 'loading' ? (
            <p className="text-xs text-gray-500">送信中...</p>
          ) : emailChangeStatus === 'success' ? (
            <p className="text-xs text-green-600 font-bold">確認メールを送信しました。保護者の方にメール内のリンクをクリックしてもらってください。</p>
          ) : (
            <div className="text-xs text-red-600">
              <p>送信失敗: {emailChangeError}</p>
              <button onClick={() => setEmailChangeStatus('form')} className="text-blue-500 underline mt-1">やり直す</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}