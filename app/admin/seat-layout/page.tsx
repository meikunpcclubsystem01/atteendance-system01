"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type LayoutRow = (string | null)[];

export default function AdminSeatLayoutPage() {
    const [layout, setLayout] = useState<LayoutRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [pinVerified, setPinVerified] = useState(false);
    const [pinInput, setPinInput] = useState("");
    const [pinError, setPinError] = useState("");

    useEffect(() => {
        if (sessionStorage.getItem("admin_pin_verified") === "true") {
            setPinVerified(true);
        }
    }, []);

    useEffect(() => {
        if (!pinVerified) return;
        fetch("/api/admin/seat-layout")
            .then((res) => res.json())
            .then((data) => {
                setLayout(data.layout);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [pinVerified]);

    const handlePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("/api/admin/verify-pin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: pinInput }),
            });
            if (res.ok) {
                sessionStorage.setItem("admin_pin_verified", "true");
                setPinVerified(true);
            } else {
                const data = await res.json();
                setPinError(data.error || "認証に失敗しました");
            }
        } catch {
            setPinError("通信エラーが発生しました");
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/admin/seat-layout", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ layout }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: "success", text: `保存しました（${data.seatCount}席）` });
            } else {
                setMessage({ type: "error", text: data.error || "保存に失敗しました" });
            }
        } catch {
            setMessage({ type: "error", text: "通信エラーが発生しました" });
        } finally {
            setSaving(false);
        }
    };

    const updateCell = (rowIdx: number, colIdx: number, value: string) => {
        const newLayout = layout.map((row) => [...row]);
        newLayout[rowIdx][colIdx] = value === "" ? null : value;
        setLayout(newLayout);
    };

    const addRow = () => {
        const cols = layout.length > 0 ? layout[0].length : 5;
        setLayout([...layout, new Array(cols).fill(null)]);
    };

    const removeRow = (rowIdx: number) => {
        setLayout(layout.filter((_, i) => i !== rowIdx));
    };

    const addColumn = () => {
        setLayout(layout.map((row) => [...row, null]));
    };

    const removeColumn = () => {
        if (layout.length > 0 && layout[0].length > 1) {
            setLayout(layout.map((row) => row.slice(0, -1)));
        }
    };

    if (!pinVerified) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <form onSubmit={handlePinSubmit} className="bg-white p-8 rounded-xl shadow-lg border w-full max-w-sm">
                    <h1 className="text-xl font-bold text-center text-gray-800 mb-2">🔐 座席レイアウト設定</h1>
                    <p className="text-sm text-gray-500 text-center mb-6">暗証番号を入力してください</p>
                    {pinError && <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-4">{pinError}</div>}
                    <input
                        type="password"
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        className="w-full border p-3 rounded-lg text-black text-center text-2xl tracking-[0.5em] mb-4"
                        placeholder="••••"
                        autoFocus
                    />
                    <button type="submit" disabled={!pinInput} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg disabled:bg-gray-400">
                        ロック解除
                    </button>
                    <div className="mt-4 text-center">
                        <Link href="/admin" className="text-sm text-blue-500 hover:underline">← 戻る</Link>
                    </div>
                </form>
            </div>
        );
    }

    if (loading) return <div className="p-8">読み込み中...</div>;

    const seatCount = layout.flat().filter((s) => s !== null).length;

    return (
        <div className="min-h-screen bg-gray-50 text-black p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold">🪑 座席レイアウト設定</h1>
                    <Link href="/admin" className="text-blue-500 hover:underline">← 管理画面へ戻る</Link>
                </div>

                <div className="bg-blue-50 text-blue-800 p-3 rounded mb-6 text-sm">
                    💡 座席名を入力すると座席になります。空欄にすると通路（空白）になります。現在 <strong>{seatCount}席</strong>
                </div>

                {message && (
                    <div className={`p-3 rounded mb-4 ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                        {message.text}
                    </div>
                )}

                {/* レイアウトエディタ */}
                <div className="bg-white rounded-xl shadow-md p-6 mb-6 border overflow-x-auto">
                    <div className="flex flex-col gap-2 min-w-fit">
                        {layout.map((row, rowIdx) => (
                            <div key={rowIdx} className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-6">{rowIdx + 1}</span>
                                {row.map((cell, colIdx) => (
                                    <input
                                        key={`${rowIdx}-${colIdx}`}
                                        type="text"
                                        value={cell || ""}
                                        onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                                        className={`w-16 h-10 text-center text-sm border rounded ${cell ? "bg-white border-gray-300 font-bold" : "bg-gray-100 border-dashed border-gray-300"
                                            }`}
                                        placeholder="空"
                                    />
                                ))}
                                <button
                                    onClick={() => removeRow(rowIdx)}
                                    className="text-red-400 hover:text-red-600 text-lg ml-1"
                                    title="この行を削除"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 行・列の追加/削除ボタン */}
                <div className="flex gap-3 mb-6">
                    <button onClick={addRow} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded text-sm">
                        + 行を追加
                    </button>
                    <button onClick={addColumn} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded text-sm">
                        + 列を追加
                    </button>
                    <button onClick={removeColumn} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded text-sm">
                        − 最後の列を削除
                    </button>
                </div>

                {/* プレビュー */}
                <div className="bg-gray-800 rounded-xl p-6 mb-6">
                    <h3 className="text-white text-sm font-bold mb-4 text-center">プレビュー</h3>
                    <div className="flex flex-col gap-3">
                        {layout.map((row, rowIdx) => (
                            <div key={`preview-${rowIdx}`} className="flex justify-center gap-2">
                                {row.map((cell, colIdx) => (
                                    <div
                                        key={`p-${rowIdx}-${colIdx}`}
                                        className={`w-14 h-14 rounded-lg flex flex-col items-center justify-center text-xs font-bold ${cell ? "bg-gray-200 text-gray-800" : ""
                                            }`}
                                    >
                                        {cell && (
                                            <>
                                                <span>{cell.replace("番", "")}</span>
                                                <span className="text-[10px] mt-0.5">空席</span>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 保存 */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition disabled:bg-gray-400"
                >
                    {saving ? "保存中..." : "レイアウトを保存する"}
                </button>
            </div>
        </div>
    );
}
