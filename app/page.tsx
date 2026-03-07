"use client"; // フック(useStateなど)を使うのでクライアントコンポーネントにします

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [qrToken, setQrToken] = useState<string>("");

  // ログインしていない場合や未登録の場合のチェック
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/api/auth/signin");
    } else if (status === "authenticated" && session?.user?.isRegistered === false) {
      router.push("/register");
    }
  }, [status, session, router]);

  // 30秒ごとに新しいQRコード用トークンを取得する関数
  const fetchQrToken = async () => {
    try {
      const res = await fetch("/api/qr");
      const data = await res.json();
      if (data.token) {
        setQrToken(data.token);
      }
    } catch (error) {
      console.error("QRトークン取得エラー:", error);
    }
  };

  // 初回表示時と、その後30秒ごとに実行
  useEffect(() => {
    if (status === "authenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchQrToken();
      const interval = setInterval(fetchQrToken, 30000); // 30秒ごと
      return () => clearInterval(interval);
    }
  }, [status]);

  if (status === "loading") {
    return <div className="flex justify-center items-center min-h-screen">読み込み中...</div>;
  }

  if (!session) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white text-black">
      <h1 className="text-2xl font-bold mb-4">
        こんにちは、{session.user.name || session.user.studentId}さん
      </h1>

      <div className="bg-gray-100 p-4 rounded-lg mb-8 text-center">
        <p className="text-sm text-gray-600 mb-1">現在のステータス</p>
        <p className={`text-2xl font-bold ${session.user.currentStatus === "IN" ? "text-green-600" : "text-gray-500"}`}>
          {session.user.currentStatus === "IN" ? "在室 (IN)" : "退室 (OUT)"}
        </p>
      </div>

      {/* QRコード表示エリア */}
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mb-8 flex flex-col items-center">
        {qrToken ? (
          <QRCodeSVG value={qrToken} size={200} level={"H"} />
        ) : (
          <div className="w-[200px] h-[200px] bg-gray-200 animate-pulse rounded"></div>
        )}
        <p className="text-xs text-gray-500 mt-4">QRコードは自動で更新されます</p>
      </div>

      <button
        onClick={() => signOut()}
        className="text-red-500 underline hover:text-red-700 text-sm"
      >
        ログアウト
      </button>
    </div>
  );
}