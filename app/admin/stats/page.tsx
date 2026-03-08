"use client";

import useSWR from "swr";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface StatsData {
    monthly: { month: string; sessions: number; uniqueUsers: number }[];
    weekday: { day: string; avg: number; total: number }[];
    totalSessions: number;
    totalUniqueUsers: number;
    totalRegistered: number;
}

export default function AdminStatsPage() {
    const { data, error } = useSWR<StatsData>("/api/admin/stats", fetcher);

    if (error) return <div className="p-8 text-red-500">エラーが発生しました</div>;
    if (!data) return <div className="p-8">読み込み中...</div>;

    const maxSessions = Math.max(...data.monthly.map(m => m.sessions), 1);
    const maxAvg = Math.max(...data.weekday.map(d => d.avg), 1);

    return (
        <div className="min-h-screen bg-gray-50 text-black p-8">
            <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold">📊 利用統計</h1>
                    <Link href="/admin" className="text-blue-500 hover:underline">
                        ← 在室者リストへ戻る
                    </Link>
                </div>

                {/* サマリーカード */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-md border text-center">
                        <p className="text-sm text-gray-500 mb-1">登録者数</p>
                        <p className="text-3xl font-black text-gray-800">{data.totalRegistered}</p>
                        <p className="text-xs text-gray-400 mt-1">名</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md border text-center">
                        <p className="text-sm text-gray-500 mb-1">のべ利用回数（6ヶ月）</p>
                        <p className="text-3xl font-black text-blue-600">{data.totalSessions}</p>
                        <p className="text-xs text-gray-400 mt-1">セッション</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md border text-center">
                        <p className="text-sm text-gray-500 mb-1">ユニーク利用者（6ヶ月）</p>
                        <p className="text-3xl font-black text-green-600">{data.totalUniqueUsers}</p>
                        <p className="text-xs text-gray-400 mt-1">名</p>
                    </div>
                </div>

                {/* 月別利用者数チャート */}
                <div className="bg-white p-6 rounded-xl shadow-md border mb-8">
                    <h2 className="text-lg font-bold mb-4">月別利用回数（過去6ヶ月）</h2>
                    {data.monthly.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">データがありません</p>
                    ) : (
                        <div className="flex items-end gap-3 h-48">
                            {data.monthly.map((m) => (
                                <div key={m.month} className="flex flex-col items-center flex-1">
                                    <span className="text-xs font-bold text-gray-600 mb-1">{m.sessions}</span>
                                    <div
                                        className="w-full bg-blue-500 rounded-t-lg transition-all duration-500 min-h-[4px]"
                                        style={{ height: `${(m.sessions / maxSessions) * 100}%` }}
                                    />
                                    <span className="text-xs text-gray-500 mt-2">{m.month.slice(5)}月</span>
                                    <span className="text-[10px] text-gray-400">{m.uniqueUsers}名</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 曜日別平均 */}
                <div className="bg-white p-6 rounded-xl shadow-md border mb-8">
                    <h2 className="text-lg font-bold mb-4">曜日別 平均利用回数</h2>
                    <div className="flex items-end gap-3 h-40">
                        {data.weekday.map((d) => (
                            <div key={d.day} className="flex flex-col items-center flex-1">
                                <span className="text-xs font-bold text-gray-600 mb-1">{d.avg}</span>
                                <div
                                    className={`w-full rounded-t-lg transition-all duration-500 min-h-[4px] ${d.day === "土" || d.day === "日" ? "bg-red-400" : "bg-green-500"
                                        }`}
                                    style={{ height: `${(d.avg / maxAvg) * 100}%` }}
                                />
                                <span className={`text-sm font-bold mt-2 ${d.day === "土" || d.day === "日" ? "text-red-500" : "text-gray-700"
                                    }`}>{d.day}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 月別データテーブル */}
                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">月</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">利用回数</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ユニーク利用者</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.monthly.map((m) => (
                                <tr key={m.month} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{m.month}</td>
                                    <td className="px-6 py-4 text-sm text-gray-700">{m.sessions} 回</td>
                                    <td className="px-6 py-4 text-sm text-gray-700">{m.uniqueUsers} 名</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
