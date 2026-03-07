"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface SessionLog {
  userId: string;
  name: string;
  studentId: string;
  inTime: string | null;
  outTime: string | null;
  durationMs: number;
  remarks: string | null;
}

export default function AdminHistoryPage() {
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);

  const { data: logs, error } = useSWR<SessionLog[]>(`/api/admin/history?date=${date}`, fetcher);

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (ms: number) => {
    if (ms <= 0) return "-";
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
  };

  const handleDownloadCsv = () => {
    if (!logs || logs.length === 0) return;

    // ヘッダー
    const headers = ["学籍番号", "氏名", "入室時間", "退出時間", "滞在時間", "備考"];
    
    // データ行の作成
    const rows = logs.map(log => [
      log.studentId || "",
      log.name || "",
      formatTime(log.inTime),
      formatTime(log.outTime),
      formatDuration(log.durationMs),
      log.remarks || ""
    ]);

    // CSV文字列の生成（BOMをつけてExcelでの文字化けを防ぐ）
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    // ダウンロードトリガー
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `日別利用者名簿_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) return <div className="p-8 text-red-500">エラーが発生しました</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-black p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">日別利用者名簿</h1>
          <Link href="/admin" className="text-blue-500 hover:underline">
            ← 在室者リストへ戻る
          </Link>
        </div>

        <div className="mb-6 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <label htmlFor="date-picker" className="font-bold">対象日:</label>
            <input
              id="date-picker"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-2 border-gray-300 rounded px-3 py-2 bg-white"
            />
          </div>
          <button
            onClick={handleDownloadCsv}
            disabled={!logs || logs.length === 0}
            className={`px-4 py-2 rounded text-white font-bold transition ${
              !logs || logs.length === 0 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            ↓ CSVダウンロード
          </button>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">学籍番号</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">氏名</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">入室時間</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">退出時間</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">滞在時間</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">備考</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {!logs ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    読み込み中...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    この日の利用記録はありません。
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{log.studentId}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{log.name}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">{formatTime(log.inTime)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">{formatTime(log.outTime)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-bold">{formatDuration(log.durationMs)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{log.remarks || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
