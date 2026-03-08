"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function PermissionForm() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [studentName, setStudentName] = useState<string>("");
    const [validFrom, setValidFrom] = useState<string>("");
    const [validUntil, setValidUntil] = useState<string>("");
    const [status, setStatus] = useState<"loading" | "idle" | "submitting" | "success" | "error" | "invalid_token">("loading");
    const [errorMessage, setErrorMessage] = useState("");

    const getMaxDate = () => {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth() + 1;
        return `${m >= 4 ? y + 1 : y}-03-31`;
    };
    const maxDateStr = getMaxDate();

    useEffect(() => {
        if (!token) {
            setStatus("invalid_token");
            return;
        }

        const fetchInfo = async () => {
            try {
                const res = await fetch(`/api/parent/permission?token=${token}`);
                if (!res.ok) throw new Error("無効なリンクです");
                const data = await res.json();
                setStudentName(data.studentName);

                // もし「希望日時」が含まれていればそれを優先的にセットし、そうでなければ現在のDBの値をセット
                if (data.requestedValidFrom) {
                    setValidFrom(data.requestedValidFrom);
                } else if (data.validFrom) {
                    setValidFrom(data.validFrom.split('T')[0]);
                }

                if (data.requestedValidUntil) {
                    setValidUntil(data.requestedValidUntil);
                } else if (data.validUntil) {
                    setValidUntil(data.validUntil.split('T')[0]);
                }

                setStatus("idle");
            } catch (e) {
                setStatus("invalid_token");
            }
        };
        fetchInfo();
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("submitting");
        try {
            const res = await fetch("/api/parent/permission", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, validFrom, validUntil }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "設定の保存に失敗しました");
            }

            setStatus("success");
        } catch (error: unknown) {
            if (error instanceof Error) {
                setErrorMessage(error.message);
            } else {
                setErrorMessage("不明なエラーが発生しました");
            }
            setStatus("error");
        }
    };

    if (status === "invalid_token") {
        return (
            <div className="bg-red-50 text-red-600 p-6 rounded text-center">
                この申請用保護者リンクは無効または期限切れです（有効期限は送信から7日間です）。<br />
                生徒にもう一度リクエストを送信してもらってください。
            </div>
        );
    }

    if (status === "loading") {
        return <div className="text-center p-6 text-gray-500">読み込み中...</div>;
    }

    if (status === "success") {
        return (
            <div className="bg-green-50 text-green-700 p-8 rounded text-center border border-green-200">
                <h2 className="text-xl font-bold mb-4">設定が完了しました！</h2>
                <p>生徒の端末で即座にロックが解除・反映されます。</p>
                <p className="text-sm mt-4 text-gray-500">このページは閉じて構いません。</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h2 className="text-lg font-bold mb-2 border-b pb-2 text-gray-800">
                {studentName} さんの利用許可設定
            </h2>
            <p className="text-sm text-gray-600 mb-6 font-bold text-blue-800 bg-blue-50 p-2 rounded">
                ※入力欄には生徒本人の「希望する利用期間」が自動的にセットされています。問題なければそのまま「保存して許可する」を押してください。
            </p>

            {status === "error" && (
                <div className="bg-red-50 text-red-600 p-3 mb-4 rounded text-sm">
                    {errorMessage}
                </div>
            )}

            <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">利用開始日</label>
                <input
                    type="date"
                    max={maxDateStr}
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full border p-2 rounded text-black"
                />
                <p className="text-xs text-gray-500 mt-1">※未入力の場合は「今すぐ」開始になります</p>
            </div>

            <div className="mb-8">
                <label className="block text-sm font-bold text-gray-700 mb-2">利用終了日（リミット期限）<span className="text-red-500 ml-1">必須</span></label>
                <input
                    type="date"
                    max={maxDateStr}
                    required
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full border p-2 rounded text-black"
                />
                <p className="text-xs text-gray-500 mt-1">※年度をまたぐ設定はできません（最長 {maxDateStr.replace(/-/g, '/')} まで）</p>
            </div>

            <p className="text-xs text-gray-600 mb-6 bg-blue-50 p-3 rounded">
                <strong>💡 ヒント</strong><br />
                ペナルティ等で利用をすぐに一時停止させたい場合は、終了日を「昨日」より前の日付に設定して保存することで、即座に生徒のスマートフォン画面をロック（利用不可状態）にできます。
            </p>

            <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors disabled:bg-gray-400"
            >
                {status === "submitting" ? "保存中..." : "利用期間を保存して許可する"}
            </button>
        </form>
    );
}

export default function ParentPermissionPage() {
    return (
        <div className="min-h-screen bg-gray-100 flex items-start justify-center p-4 pt-12">
            <div className="w-full max-w-md">
                <h1 className="text-2xl font-black text-center mb-6 text-gray-800">パソコン部 入退室システム<br /><span className="text-lg font-normal text-gray-600">保護者用 設定ページ</span></h1>
                <Suspense fallback={<div className="text-center p-6 text-gray-500 bg-white shadow rounded">読み込み中...</div>}>
                    <PermissionForm />
                </Suspense>
            </div>
        </div>
    );
}
