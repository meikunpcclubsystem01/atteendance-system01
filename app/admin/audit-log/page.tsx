"use client";

import useSWR from "swr";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface AuditLog {
    id: string;
    adminEmail: string;
    action: string;
    details: string | null;
    timestamp: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    FORCE_LOGOUT: { label: "強制退出", color: "bg-orange-100 text-orange-800" },
    BULK_FORCE_LOGOUT: { label: "一括退出", color: "bg-red-100 text-red-800" },
    DELETE_USER: { label: "ユーザー削除", color: "bg-red-100 text-red-800" },
    YEAR_RESET: { label: "年度リセット", color: "bg-purple-100 text-purple-800" },
};

export default function AdminAuditLogPage() {
    const { data: logs, error } = useSWR<AuditLog[]>("/api/admin/audit-log", fetcher);

    if (error) return <div className="p-8 text-red-500">エラーが発生しました</div>;
    if (!logs) return <div className="p-8">読み込み中...</div>;

    const formatTime = (isoStr: string) => {
        const d = new Date(isoStr);
        return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div className="min-h-screen bg-gray-50 text-black p-8">
            <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold">📋 管理者操作ログ</h1>
                    <Link href="/admin" className="text-blue-500 hover:underline">
                        ← 在室者リストへ戻る
                    </Link>
                </div>

                {logs.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                        操作ログはまだありません
                    </div>
                ) : (
                    <div className="bg-white shadow-md rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">日時</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">操作者</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">操作</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">詳細</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {logs.map((log) => {
                                    const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: "bg-gray-100 text-gray-800" };
                                    return (
                                        <tr key={log.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatTime(log.timestamp)}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">{log.adminEmail.split("@")[0]}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${actionInfo.color}`}>
                                                    {actionInfo.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={log.details || ""}>
                                                {log.details || "-"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
