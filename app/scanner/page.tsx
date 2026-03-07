"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import SeatMap from "@/components/SeatMap";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ScannerPage() {
  const [lastScanned, setLastScanned] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("座席を選択してスキャン待機中...");
  const [selectedSeat, setSelectedSeat] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 定期的に使用中の座席を取得（5秒間隔）
  const { data: seatData, mutate: mutateSeats } = useSWR<{ occupiedSeats: string[] }>("/api/seats", fetcher, {
    refreshInterval: 5000,
  });

  // 全座席リスト (ドロップダウンは使わなくなりましたが、マッピング用に残しています)
  const allSeats = Array.from({ length: 30 }, (_, i) => `${i + 1}番`);

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

  // QRコードが読み込まれた（Enterキーが押された）ときの処理
  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const token = e.currentTarget.value;
      if (!token) return;

      // 入力ボックスをクリアして次の読み取りに備える
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      setStatusMessage("処理中...");

      try {
        const res = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, seat: selectedSeat }),
        });

        const data = await res.json();

        if (res.ok) {
          setLastScanned(`${data.user.name}さんが ${data.action === "IN" ? "入室" : "退室"} しました`);
          setStatusMessage("成功！次のQRをどうぞ");

          if (data.action === "IN") {
            // 入室後は座席選択をクリアし、座席情報を再取得
            setSelectedSeat("");
            mutateSeats();
          } else {
            // 退室の場合も座席が空くため再取得
            mutateSeats();
          }
        } else {
          setStatusMessage("エラー: " + (data.error || "読み取り失敗"));
        }
      } catch (_error) {
        setStatusMessage("通信エラーが発生しました");
      }

      // スキャン後、再度入力ボックスにフォーカスを戻す
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8">QRコード読み取り機</h1>

      <div className="mb-4 text-center">
        <label className="block text-xl text-gray-300 mb-2 font-bold">
          入室する座席を選んでからスキャンしてください<br />
          <span className="text-sm text-gray-500 font-normal">※退室時は座席選択不要です</span>
        </label>

        {/* ビジュアル座席マップコンポーネント */}
        <SeatMap
          selectedSeat={selectedSeat}
          onSelectSeat={(seat) => {
            setSelectedSeat(seat);
            // 座席選択直後にQRリーダー入力待機状態へフォーカスを戻す
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          occupiedSeats={seatData?.occupiedSeats || []}
        />
      </div>

      {/* 隠し入力ボックス（ここにQRリーダーが文字を入力します） */}
      <input
        ref={inputRef}
        type="text"
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