"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ScannerPage() {
  const [lastScanned, setLastScanned] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("待機中...");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // 画面を開いたときに自動で入力ボックスにフォーカスを当てる
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    // 画面をクリックしたら再フォーカス（フォーカス外れ防止）
    const handleClick = () => inputRef.current?.focus();
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // QRコードが読み込まれた（Enterキーが押された）ときの処理
  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const token = inputRef.current?.value;
      if (!token) return;

      // 入力ボックスをクリアして次の読み取りに備える
      inputRef.current.value = "";
      setStatusMessage("処理中...");

      try {
        const res = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (res.ok) {
          setLastScanned(`${data.user.name}さんが ${data.action === "IN" ? "入室" : "退室"} しました`);
          setStatusMessage("成功！次のQRをどうぞ");
        } else {
          setStatusMessage("エラー: " + (data.error || "読み取り失敗"));
        }
      } catch (error) {
        setStatusMessage("通信エラーが発生しました");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-8">QRコード読み取り機</h1>
      
      {/* 隠し入力ボックス（ここにQRリーダーが文字を入力します） */}
      <input
        ref={inputRef}
        type="text"
        className="opacity-0 absolute top-0 left-0 h-0 w-0" // 画面外に隠す
        onKeyDown={handleScan}
        autoFocus
      />

      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-2xl text-center">
        <p className="text-xl text-gray-400 mb-4">ステータス</p>
        <div className={`text-3xl font-bold mb-8 ${statusMessage.includes("エラー") ? "text-red-500" : "text-green-400"}`}>
          {statusMessage}
        </div>

        <div className="border-t border-gray-700 pt-8">
          <p className="text-sm text-gray-500 mb-2">直前の読み取り結果</p>
          <p className="text-2xl font-bold">{lastScanned || "まだありません"}</p>
        </div>
      </div>

      <p className="mt-8 text-gray-500 text-sm">
        ※ 画面をクリックしてフォーカスを維持してください
      </p>
    </div>
  );
}