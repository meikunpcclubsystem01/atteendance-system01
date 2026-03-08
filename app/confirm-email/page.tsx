"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ConfirmEmailResult() {
    const searchParams = useSearchParams();
    const success = searchParams.get("success");

    if (success === "true") {
        return (
            <div className="bg-green-50 text-green-700 p-8 rounded-lg text-center border border-green-200 shadow-md">
                <p className="text-4xl mb-4">✅</p>
                <h2 className="text-xl font-bold mb-4">メールアドレスの変更が完了しました</h2>
                <p className="text-sm text-gray-600">
                    今後の入退室通知や利用許可リクエストは、新しいメールアドレスに届きます。
                </p>
                <p className="text-xs text-gray-400 mt-6">このページは閉じて構いません。</p>
            </div>
        );
    }

    return (
        <div className="bg-red-50 text-red-600 p-8 rounded-lg text-center border border-red-200 shadow-md">
            <p className="text-4xl mb-4">❌</p>
            <h2 className="text-xl font-bold mb-4">リンクが無効または期限切れです</h2>
            <p className="text-sm">
                このリンクは有効期限（7日間）が過ぎているか、無効なリンクです。<br />
                生徒に再度メールアドレス変更のリクエストを依頼してください。
            </p>
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
