"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import useSWR from "swr";
import SeatMap from "@/components/SeatMap";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function CameraScannerPage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [scannerMode, setScannerMode] = useState<"SCANNING" | "SELECT_SEAT">("SCANNING");
    const [scannedToken, setScannedToken] = useState<string>("");
    const [scannedUserName, setScannedUserName] = useState<string>("");
    const [lastScanned, setLastScanned] = useState<string>("");
    const [statusMessage, setStatusMessage] = useState<string>("カメラを起動中...");
    const [cameraError, setCameraError] = useState<string>("");
    const lastProcessedRef = useRef<string>("");

    const { data: seatData, mutate: mutateSeats } = useSWR<{ occupiedSeats: string[]; layout?: (string | null)[][] }>("/api/seats", fetcher, {
        refreshInterval: 5000,
    });

    // カメラ起動
    useEffect(() => {
        let stream: MediaStream | null = null;

        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play();
                    setStatusMessage("QRコードをカメラにかざしてください");
                }
            } catch {
                setCameraError("カメラの起動に失敗しました。カメラの権限を許可してください。");
            }
        };

        startCamera();

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // QRコードスキャンループ
    useEffect(() => {
        if (cameraError || scannerMode !== "SCANNING") return;

        const interval = setInterval(() => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code && code.data && code.data !== lastProcessedRef.current) {
                lastProcessedRef.current = code.data;
                handleScan(code.data);

                // 3秒後にリセット（同じQRを連続で読まないように）
                setTimeout(() => { lastProcessedRef.current = ""; }, 3000);
            }
        }, 200);

        return () => clearInterval(interval);
    }, [cameraError, scannerMode]);

    // ステータスメッセージの自動リセット
    useEffect(() => {
        if (statusMessage !== "QRコードをカメラにかざしてください" && scannerMode === "SCANNING") {
            const timer = setTimeout(() => {
                setStatusMessage("QRコードをカメラにかざしてください");
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage, scannerMode]);

    const handleScan = async (token: string) => {
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
                return;
            }

            const user = verifyData.user;
            const userName = user.name || "生徒";
            setScannedUserName(userName);

            if (user.currentStatus === "IN") {
                setStatusMessage("退室処理中...");
                await executeCheckin(token, null);
            } else {
                setScannedToken(token);
                setScannerMode("SELECT_SEAT");
                setStatusMessage(`${userName}さん、空いている座席をタップしてください`);
            }
        } catch {
            setStatusMessage("通信エラーが発生しました");
        }
    };

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
        } catch {
            setStatusMessage("通信エラーが発生しました");
        } finally {
            setScannerMode("SCANNING");
            setScannedToken("");
            setScannedUserName("");
        }
    };

    const handleSeatClick = (seat: string) => {
        if (scannerMode === "SCANNING") {
            setStatusMessage("先にQRコードをかざしてください");
            return;
        }
        if (scannerMode === "SELECT_SEAT" && scannedToken) {
            setStatusMessage("入室処理中...");
            executeCheckin(scannedToken, seat);
        }
    };

    const handleCancelSelect = () => {
        setScannerMode("SCANNING");
        setScannedToken("");
        setScannedUserName("");
        setStatusMessage("キャンセルしました。次のQRをどうぞ");
    };

    if (cameraError) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
                <div className="bg-red-900/50 p-8 rounded-xl text-center max-w-md">
                    <p className="text-2xl mb-4">📷</p>
                    <p className="text-lg font-bold mb-2">カメラエラー</p>
                    <p className="text-gray-300 mb-6">{cameraError}</p>
                    <Link href="/scanner" className="text-blue-400 hover:underline">
                        USBスキャナーモードに戻る →
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
            <div className="flex items-center gap-4 mb-4">
                <h1 className="text-2xl font-bold">📷 カメラモード</h1>
                <Link href="/scanner" className="text-blue-400 hover:underline text-sm">
                    USBモードに切替 →
                </Link>
            </div>

            {/* カメラプレビュー */}
            <div className="relative mb-4 rounded-xl overflow-hidden border-2 border-gray-700" style={{ maxWidth: 400 }}>
                <video ref={videoRef} className="w-full" playsInline muted />
                <canvas ref={canvasRef} className="hidden" />
                {scannerMode === "SCANNING" && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-green-400 rounded-lg opacity-70" />
                    </div>
                )}
            </div>

            {/* ステータスと座席選択 */}
            <div className="w-full max-w-2xl">
                {scannerMode === "SCANNING" ? (
                    <div className="bg-blue-600/20 text-blue-300 p-3 rounded-xl mb-4 border border-blue-600/30 text-center">
                        <p className="font-bold">QRコードをカメラにかざしてください</p>
                    </div>
                ) : (
                    <div className="bg-green-600/20 text-green-300 p-3 rounded-xl mb-4 border border-green-600/30 text-center">
                        <p className="font-bold">{scannedUserName}さん、座る席をタップしてください</p>
                        <button onClick={handleCancelSelect} className="mt-2 bg-gray-600 hover:bg-gray-500 text-white text-sm py-1 px-4 rounded">
                            キャンセル
                        </button>
                    </div>
                )}

                <div className={scannerMode === "SCANNING" ? "opacity-60 pointer-events-none" : ""}>
                    <SeatMap selectedSeat="" onSelectSeat={handleSeatClick} occupiedSeats={seatData?.occupiedSeats || []} layout={seatData?.layout} />
                </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-xl shadow-lg w-full max-w-2xl text-center mt-4">
                <p className="text-sm text-gray-400 mb-2">ステータス</p>
                <div className={`text-xl font-bold mb-4 ${statusMessage.includes("エラー") ? "text-red-500" : "text-green-400"}`}>
                    {statusMessage}
                </div>
                <div className="border-t border-gray-700 pt-4">
                    <p className="text-xs text-gray-500 mb-1">直前の読み取り結果</p>
                    <p className="text-lg font-bold">{lastScanned || "まだありません"}</p>
                </div>
            </div>
        </div>
    );
}
