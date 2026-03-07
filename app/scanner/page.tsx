"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import SeatMap from "@/components/SeatMap";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ScannerPage() {
  const [scannerMode, setScannerMode] = useState<"IDLE" | "SELECT_SEAT">("IDLE");
  const [scannedToken, setScannedToken] = useState<string>("");
  const [scannedUserName, setScannedUserName] = useState<string>("");
  const [lastScanned, setLastScanned] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("QRスキャン待機中...");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: seatData, mutate: mutateSeats } = useSWR<{ occupiedSeats: string[] }>("/api/seats", fetcher, {
    refreshInterval: 5000,
  });

  // 画面を開いたときに自動で入力ボックスにフォーカスを当てる
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }

    // 画面をクリックしたら再フォーカス（フォーカス外れ防止）
    const handleClick = (e: MouseEvent) => {
      // SeatMap内のボタンがクリックされた時はフォーカスを奪わないようにする
      const target = e.target as HTMLElement;
      if (
        target.tagName !== "SELECT" &&
        target.tagName !== "BUTTON" &&
        !target.closest('button') &&
        inputRef.current
      ) {
        inputRef.current.focus();
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // エラー/成功メッセージの自動フェードアウト (5秒後に初期化)
  useEffect(() => {
    if (statusMessage !== "QRスキャン待機中..." && scannerMode === "IDLE") {
      const timer = setTimeout(() => {
        setStatusMessage("QRスキャン待機中...");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage, scannerMode]);

  // QRコードが読み込まれた（Enterキーが押された）ときの処理
  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const token = e.currentTarget.value;
      if (!token) return;

      // 入力ボックスをクリアして次の読み取りに備える
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      setStatusMessage("QRコード確認中...");

      try {
        const verifyRes = await fetch("/api/scanner/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const verifyData = await verifyRes.json();

        if (!verifyRes.ok) {
          setStatusMessage("エラー: " + (verifyData.error || "読み取り失敗"));
          setTimeout(() => inputRef.current?.focus(), 100);
          return;
        }

        const user = verifyData.user;
        const userName = user.name || "生徒";
        setScannedUserName(userName);

        if (user.currentStatus === "IN") {
          // すでに入室中 -> そのまま退室処理へ
          setStatusMessage("退室処理中...");
          await executeCheckin(token, null);
        } else {
          // 退室中 -> 入室処理のため座席選択モードへ
          setScannedToken(token);
          setScannerMode("SELECT_SEAT");
          setStatusMessage(`${userName}さん、空いている座席をタップしてください`);
        }
      } catch (_error) {
        setStatusMessage("通信エラーが発生しました");
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  };

  // 実際の入退室処理の実行
  const executeCheckin = async (token: string, seat: string | null) => {
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, seat }),
      });

      const data = await res.json();

      if (res.ok) {
        setLastScanned(`${data.user.name}さんが ${data.action === "IN" ? "入室" : "退室"} しました`);
        setStatusMessage("成功！次のQRをどうぞ");
        mutateSeats();
      } else {
        setStatusMessage("エラー: " + (data.error || "処理失敗"));
      }
    } catch (_error) {
      setStatusMessage("通信エラーが発生しました");
    } finally {
      // 処理が終わったらIDLE状態に戻す
      setScannerMode("IDLE");
      setScannedToken("");
      setScannedUserName("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // 座席がクリックされたときの処理
  const handleSeatClick = (seat: string) => {
    if (scannerMode === "IDLE") {
      setStatusMessage("先にQRコードをかざしてください");
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    if (scannerMode === "SELECT_SEAT" && scannedToken) {
      setStatusMessage("入室処理中...");
      executeCheckin(scannedToken, seat);
    }
  };

  const handleCancelSelect = () => {
    setScannerMode("IDLE");
    setScannedToken("");
    setScannedUserName("");
    setStatusMessage("キャンセルしました。次のQRをどうぞ");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8">QRコード読み取り機</h1>

      <div className="mb-4 text-center">
        {scannerMode === "IDLE" ? (
          <div className="bg-blue-600/20 text-blue-300 p-4 rounded-xl mb-4 border border-blue-600/30">
            <p className="text-xl font-bold">1️⃣ 先にQRコードをかざしてください</p>
            <p className="text-sm mt-1">退室時はかざすだけで完了します</p>
          </div>
        ) : (
          <div className="bg-green-600/20 text-green-300 p-4 rounded-xl mb-4 border border-green-600/30">
            <p className="text-xl font-bold">2️⃣ {scannedUserName}さん、座る席をタップしてください</p>
            <button
              onClick={handleCancelSelect}
              className="mt-3 bg-gray-600 hover:bg-gray-500 text-white text-sm py-1 px-4 rounded"
            >
              キャンセル
            </button>
          </div>
        )}

        {/* ビジュアル座席マップコンポーネント */}
        <div className={scannerMode === "IDLE" ? "opacity-60 pointer-events-none" : ""}>
          <SeatMap
            selectedSeat={""} // 座席選択状態の保持は不要になった（タップ即送信）
            onSelectSeat={handleSeatClick}
            occupiedSeats={seatData?.occupiedSeats || []}
          />
        </div>
      </div>

      {/* 隠し入力ボックス（ここにQRリーダーが文字を入力します） */}
      <input
        ref={inputRef}
        type="password" // IME(日本語入力)を強制無効化し、全角入力の誤動作を防ぐ（QK30-Uなどのバーコードリーダー対応）
        className="opacity-0 absolute h-0 w-0 -z-10" // 完全に隠す（focusできるようにする）
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
        ※ 画面またはセレクトボックスをクリックしてフォーカスを維持してください
      </p>
    </div>
  );
}