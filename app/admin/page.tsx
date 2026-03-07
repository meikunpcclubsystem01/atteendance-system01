"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState, useEffect } from "react";

// データを取得するための関数
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface User {
  id: string;
  studentId: string;
  name: string;
  email: string;
  currentSeat: string | null;
  logs?: { timestamp: string }[];
}

export default function AdminPage() {
  // 3秒ごとに自動でデータを再取得する設定
  const { data: users, error, mutate } = useSWR<User[]>("/api/admin/active-users", fetcher, {
    refreshInterval: 3000,
  });

  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleForceLogout = async (userId: string) => {
    if (!window.confirm("この生徒を強制退出させますか？")) return;

    setLoadingId(userId);
    try {
      const res = await fetch("/api/admin/force-logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        alert("退出処理に失敗しました");
      } else {
        mutate();
      }
    } catch (_err) {
      alert("通信エラーが発生しました");
    } finally {
      setLoadingId(null);
    }
  };

  // 滞在時間の計算用（1分ごとに再描画させるためのステート）
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatInTimeAndDuration = (logs?: { timestamp: string }[]) => {
    if (!logs || logs.length === 0) return { inTime: "-", duration: "-" };

    const inDate = new Date(logs[0].timestamp);
    const inTimeStr = inDate.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

    const ms = now.getTime() - inDate.getTime();
    if (ms <= 0) return { inTime: inTimeStr, duration: "0分" };

    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const durationStr = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;

    return { inTime: inTimeStr, duration: durationStr };
  };

  if (error) return <div className="p-8 text-red-500">エラーが発生しました</div>;
  if (!users) return <div className="p-8">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-black p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">在室者リスト (管理画面)</h1>
          <div className="flex space-x-4 items-center">
            <Link href="/admin/users" className="text-indigo-600 hover:underline font-bold">
              ユーザー管理（有効期限設定）
            </Link>
            <Link href="/admin/history" className="text-indigo-600 hover:underline font-bold">
              日別履歴表示
            </Link>
            <a
              href="/api/admin/export"
              download
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2 rounded shadow transition"
            >
              CSVダウンロード
            </a>
            <span className="bg-green-100 text-green-800 text-lg font-bold px-4 py-2 rounded-full">
              現在 {users.length} 名
            </span>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  学籍番号
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  氏名
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  座席
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  入室時間
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  経過・状態
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    現在、在室している生徒はいません。
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.studentId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.currentSeat || "指定なし"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {formatInTimeAndDuration(user.logs).inTime}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col space-y-1">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 self-start">
                          在室中
                        </span>
                        <span className="text-xs text-gray-500 font-bold">
                          {formatInTimeAndDuration(user.logs).duration}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleForceLogout(user.id)}
                        disabled={loadingId === user.id}
                        className={`px-4 py-2 rounded text-white ${loadingId === user.id ? "bg-red-300" : "bg-red-500 hover:bg-red-600"
                          }`}
                      >
                        {loadingId === user.id ? "処理中..." : "強制退出"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-blue-500 underline hover:text-blue-700">
            トップページへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}