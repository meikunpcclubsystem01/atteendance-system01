"use client"; // ブラウザ側で動くプログラムという宣言

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentEmail }),
      });

      if (res.ok) {
        router.refresh();
        router.push("/");
      } else {
        const data = await res.json();
        setError(data.error || "登録に失敗しました。入力内容を確認してください。");
      }
    } catch {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-md w-96">
        <h1 className="text-xl font-bold mb-6 text-center text-black">初回登録</h1>

        {error && (
          <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded border border-red-200">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-bold mb-2 text-gray-700">本名</label>
          <input
            required
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border p-2 rounded text-black"
            placeholder="山田 太郎"
          />
        </div>

        <div className="mb-8">
          <label className="block text-sm font-bold mb-2 text-gray-700">保護者のメールアドレス</label>
          <input
            required
            type="email"
            value={parentEmail}
            onChange={e => setParentEmail(e.target.value)}
            className="w-full border p-2 rounded text-black"
            placeholder="parent@example.com"
          />
          <p className="text-xs text-red-500 mt-1">※学校のメールアドレス（@niigata-meikun.ed.jp）は使用できません</p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600 transition disabled:bg-gray-400"
        >
          {isSubmitting ? "登録中..." : "登録を完了する"}
        </button>
      </form>
    </div>
  );
}