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

  // 混雑状況用
  const [occupiedCount, setOccupiedCount] = useState<number>(0);
  const TOTAL_SEATS = 30; // 自習室の総座席数

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
    return <div className="flex justify-center items-center min-h-screen">読み込み中...</div>;
  }

  if (!session) return null;

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
              <span className="text-2xl font-bold text-gray-800">{occupiedCount} <span className="text-sm font-normal text-gray-500">/ {TOTAL_SEATS} 人</span></span>
              <span className="text-sm font-bold text-blue-600">{Math.round((occupiedCount / TOTAL_SEATS) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-1 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${(occupiedCount / TOTAL_SEATS) > 0.8 ? 'bg-red-500' :
                    (occupiedCount / TOTAL_SEATS) > 0.5 ? 'bg-yellow-400' : 'bg-green-500'
                  }`}
                style={{ width: `${Math.min((occupiedCount / TOTAL_SEATS) * 100, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-right">※30秒ごとに自動更新</p>
          </div>

          {/* QRコード表示エリア */}
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mb-8 flex flex-col items-center w-full">
            {qrToken ? (
              <QRCodeSVG value={qrToken} size={200} level={"H"} />
            ) : (
              <div className="w-[200px] h-[200px] bg-gray-200 animate-pulse rounded"></div>
            )}
            <p className="text-xs text-gray-500 mt-4">QRコードは自動で更新されます</p>
          </div>

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
        className="text-red-500 underline hover:text-red-700 text-sm"
      >
        ログアウト
      </button>
    </div>
  );
}