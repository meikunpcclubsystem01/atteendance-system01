"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface HistoryItem {
    date: string;
    inTime: string;
    outTime: string;
    duration: string;
}

function ParentHistoryContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [studentName, setStudentName] = useState<string>("");
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");

    useEffect(() => {
        if (!token) {
            setStatus("error");
            return;
        }

        const fetchHistory = async () => {
            try {
                const res = await fetch(`/api/parent/history?token=${token}`);
                if (!res.ok) throw new Error("Invalid token");
                const data = await res.json();
                setStudentName(data.studentName);
                setHistory(data.history);
                setStatus("idle");
            } catch {
                setStatus("error");
            }
        };
        fetchHistory();
    }, [token]);

    if (status === "loading") {
        return <div className="text-center p-6 text-gray-500">読み込み中...</div>;
    }

    if (status === "error") {
        return (
            <div className="bg-red-50 text-red-600 p-6 rounded text-center">
                このリンクは無効または期限切れです。<br />
                入退室時に届くメールのリンクからアクセスしてください。
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-md border">
            <div className="p-6 border-b">
                <h2 className="text-lg font-bold text-gray-800">
                    {studentName} さんの利用履歴
                </h2>
                <p className="text-sm text-gray-500 mt-1">最新の利用状況を表示しています</p>
            </div>

            {history.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                    利用履歴がありません
                </div>
            ) : (
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">日付</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">入室</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">退室</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">滞在</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {history.map((item, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{item.date}</td>
                                <td className="px-4 py-3 text-sm text-blue-600 font-semibold">{item.inTime}</td>
                                <td className="px-4 py-3 text-sm text-red-600 font-semibold">{item.outTime}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 font-bold">{item.duration}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default function ParentHistoryPage() {
    return (
        <div className="min-h-screen bg-gray-100 flex items-start justify-center p-4 pt-12">
            <div className="w-full max-w-lg">
                <h1 className="text-2xl font-black text-center mb-6 text-gray-800">
                    パソコン部 入退室システム<br />
                    <span className="text-lg font-normal text-gray-600">保護者用 利用状況</span>
                </h1>
                <Suspense fallback={<div className="text-center p-6 text-gray-500 bg-white shadow rounded">読み込み中...</div>}>
                    <ParentHistoryContent />
                </Suspense>
                <p className="text-xs text-gray-400 text-center mt-4">
                    ※ このページは入退室通知メールのリンクからアクセスできます
                </p>
            </div>
        </div>
    );
}
