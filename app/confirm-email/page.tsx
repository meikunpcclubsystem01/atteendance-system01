"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const errorMessages: Record<string, { title: string; description: string }> = {
    already_used: {
        title: "このリンクは既に使用済みです",
        description: "確認リンクは1回限り有効です。再度変更が必要な場合は、生徒に新しいリクエストを依頼してください。",
    },
    invalid: {
        title: "無効なリンクです",
        description: "このリンクは無効、失効済み、または期限切れです。",
    },
};

function SuccessPanel() {
    return (
        <div className="bg-green-50 text-green-700 p-8 rounded-lg text-center border border-green-200 shadow-md">
            <p className="text-4xl mb-4">✅</p>
            <h2 className="text-xl font-bold mb-4">メールアドレスの変更が完了しました</h2>
            <p className="text-sm text-gray-600">今後の入退室通知や利用許可リクエストは、新しいメールアドレスに届きます。</p>
            <p className="text-xs text-gray-400 mt-6">このページは閉じて構いません。</p>
        </div>
    );
}

function ConfirmEmailResult() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");
    const initialSuccess = searchParams.get("success") === "true";
    const initialError = searchParams.get("error");
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(initialSuccess ? "success" : "idle");
    const [message, setMessage] = useState<string>("");

    if (status === "success") return <SuccessPanel />;

    if (token && !initialError) {
        const confirm = async () => {
            setStatus("loading");
            try {
                const response = await fetch("/api/user/confirm-parent-email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const data = await response.json();
                if (!response.ok) {
                    setMessage(data.error || "確認に失敗しました");
                    setStatus("error");
                    return;
                }
                setStatus("success");
            } catch {
                setMessage("通信エラーが発生しました。時間をおいて再試行してください。");
                setStatus("error");
            }
        };

        return (
            <div className="bg-white p-8 rounded-lg text-center border border-gray-200 shadow-md">
                <p className="text-4xl mb-4">✉️</p>
                <h2 className="text-xl font-bold mb-4 text-gray-800">保護者メールの変更を確認</h2>
                <p className="text-sm text-gray-600 mb-6">下のボタンを押すまでメールアドレスは変更されません。</p>
                {status === "error" && <p className="text-sm text-red-600 mb-4">{message}</p>}
                <button
                    type="button"
                    onClick={confirm}
                    disabled={status === "loading"}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded"
                >
                    {status === "loading" ? "確認中..." : "このメールアドレスへの変更を確定する"}
                </button>
            </div>
        );
    }

    const errorInfo = initialError ? errorMessages[initialError] : null;
    return (
        <div className="bg-red-50 text-red-600 p-8 rounded-lg text-center border border-red-200 shadow-md">
            <p className="text-4xl mb-4">❌</p>
            <h2 className="text-xl font-bold mb-4">{errorInfo?.title || "リンクが無効または期限切れです"}</h2>
            <p className="text-sm">{errorInfo?.description || "生徒に再度メールアドレス変更のリクエストを依頼してください。"}</p>
        </div>
    );
}

export default function ConfirmEmailPage() {
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <h1 className="text-2xl font-black text-center mb-6 text-gray-800">
                    入退室システム<br />
                    <span className="text-lg font-normal text-gray-600">メールアドレス変更確認</span>
                </h1>
                <Suspense fallback={<div className="text-center p-6 text-gray-500 bg-white shadow rounded">読み込み中...</div>}>
                    <ConfirmEmailResult />
                </Suspense>
            </div>
        </div>
    );
}
