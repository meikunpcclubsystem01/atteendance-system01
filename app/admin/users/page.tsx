"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState, useEffect } from "react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface User {
  id: string;
  studentId: string | null;
  name: string | null;
  email: string | null;
  parentEmail: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export default function AdminUsersPage() {
  const [pinVerified, setPinVerified] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");
  const [pinLoading, setPinLoading] = useState<boolean>(false);

  // セッションストレージからPIN認証済みかチェック
  useEffect(() => {
    if (sessionStorage.getItem("admin_pin_verified") === "true") {
      setPinVerified(true);
    }
  }, []);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLoading(true);
    setPinError("");
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
    } finally {
      setPinLoading(false);
    }
  };

  // PIN未認証の場合はPIN入力画面を表示
  if (!pinVerified) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form onSubmit={handlePinSubmit} className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 w-full max-w-sm">
          <h1 className="text-xl font-bold text-center text-gray-800 mb-2">🔐 ユーザー管理</h1>
          <p className="text-sm text-gray-500 text-center mb-6">このページはシステム管理者専用です。<br />暗証番号を入力してください。</p>
          {pinError && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-4 border border-red-200">{pinError}</div>
          )}
          <input
            type="password"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg text-black text-center text-2xl tracking-[0.5em] mb-4"
            placeholder="••••"
            autoFocus
          />
          <button
            type="submit"
            disabled={pinLoading || !pinInput}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-400"
          >
            {pinLoading ? "確認中..." : "ロック解除"}
          </button>
          <div className="mt-4 text-center">
            <Link href="/admin" className="text-sm text-blue-500 hover:underline">← 戻る</Link>
          </div>
        </form>
      </div>
    );
  }

  // PIN認証済み：通常のユーザー管理ページを表示
  return <AdminUsersContent />;
}

function AdminUsersContent() {
  const { data: users, error, mutate } = useSWR<User[]>("/api/admin/users", fetcher);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ studentId: "", validFrom: "", validUntil: "", parentEmail: "" });
  const [resetStatus, setResetStatus] = useState<'idle' | 'preview' | 'loading' | 'done'>('idle');
  const [resetPreview, setResetPreview] = useState<number>(0);
  const [resetPin, setResetPin] = useState<string>("");

  if (error) return <div className="p-8 text-red-500">エラーが発生しました</div>;
  if (!users) return <div className="p-8">読み込み中...</div>;

  const handleEditClick = (user: User) => {
    setEditingUserId(user.id);
    setEditForm({
      studentId: user.studentId || "",
      validFrom: user.validFrom ? new Date(new Date(user.validFrom).getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0] : "",
      validUntil: user.validUntil ? new Date(new Date(user.validUntil).getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0] : "",
      parentEmail: user.parentEmail || "",
    });
  };

  const handleSave = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: editForm.studentId,
          validFrom: editForm.validFrom || null,
          validUntil: editForm.validUntil || null,
          parentEmail: editForm.parentEmail,
        }),
      });

      if (res.ok) {
        mutate();
        setEditingUserId(null);
      } else {
        alert("保存に失敗しました");
      }
    } catch (_error) {
      alert("通信エラーが発生しました");
    }
  };

  const handleDelete = async (userId: string, userName: string | null) => {
    if (!window.confirm(`${userName || 'このユーザー'} のアカウントとすべての履歴を完全に削除します。よろしいですか？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        mutate();
      } else {
        alert("削除に失敗しました");
      }
    } catch (_error) {
      alert("通信エラーが発生しました");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-black p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">ユーザー管理 (利用期間設定)</h1>
          <div className="flex items-center gap-4">
            <a
              href="/api/admin/export"
              download
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2 rounded shadow transition"
            >
              CSVダウンロード
            </a>
            <Link href="/admin" className="text-blue-500 hover:underline">
              ← 在室者リストへ戻る
            </Link>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">学籍番号</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">氏名</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">有効期間（開始）</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">有効期間（終了）</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">保護者メール</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition">
                  {editingUserId === user.id ? (
                    <>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <input
                          type="text"
                          value={editForm.studentId}
                          onChange={(e) => setEditForm({ ...editForm, studentId: e.target.value })}
                          className="border rounded px-2 py-1 bg-white w-24 text-black"
                          placeholder="学籍番号"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{user.name}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <input
                          type="date"
                          value={editForm.validFrom}
                          onChange={(e) => setEditForm({ ...editForm, validFrom: e.target.value })}
                          className="border rounded px-2 py-1 bg-white text-black"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <input
                          type="date"
                          value={editForm.validUntil}
                          onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })}
                          className="border rounded px-2 py-1 bg-white text-black"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <input
                          type="email"
                          value={editForm.parentEmail}
                          onChange={(e) => setEditForm({ ...editForm, parentEmail: e.target.value })}
                          className="border rounded px-2 py-1 bg-white w-40 text-black"
                          placeholder="保護者メール"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleSave(user.id)}
                          className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 mr-2"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="bg-gray-300 text-gray-800 px-3 py-1 rounded hover:bg-gray-400"
                        >
                          ｷｬﾝｾﾙ
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.studentId}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{user.name}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.validFrom ? new Date(user.validFrom).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未設定"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.validUntil ? new Date(user.validUntil).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未設定"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 max-w-[160px] truncate" title={user.parentEmail || ""}>
                        {user.parentEmail || "未設定"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm flex gap-3">
                        <button
                          onClick={() => handleEditClick(user)}
                          className="text-indigo-600 hover:text-indigo-900 font-bold"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, user.name)}
                          className="text-red-600 hover:text-red-900 font-bold"
                        >
                          削除
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 年度切り替えセクション（折りたたみ） */}
        <details className="mt-8">
          <summary className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer select-none">
            ⚙️ 年度切り替え（一括リセット）
          </summary>
          <div className="mt-2 bg-white shadow-md rounded-lg p-4 border border-orange-200">
            <p className="text-xs text-gray-500 mb-3">
              全ユーザーの利用許可期間をリセットします。新年度の開始時に使用してください。
            </p>

            {resetStatus === 'idle' && (
              <button
                onClick={async () => {
                  setResetStatus('loading');
                  try {
                    const pinToUse = sessionStorage.getItem("admin_pin_verified") === "true" ? resetPin : "";
                    const res = await fetch("/api/admin/reset-year", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ pin: pinToUse, confirm: false }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setResetPreview(data.targetCount);
                      setResetStatus('preview');
                    } else {
                      setResetStatus('idle');
                      alert("プレビューの取得に失敗しました");
                    }
                  } catch {
                    setResetStatus('idle');
                    alert("通信エラーが発生しました");
                  }
                }}
                className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1.5 px-4 rounded transition"
              >
                リセット対象を確認する
              </button>
            )}

            {resetStatus === 'loading' && (
              <p className="text-gray-500 text-sm">読み込み中...</p>
            )}

            {resetStatus === 'preview' && (
              <div className="bg-orange-50 p-3 rounded border border-orange-200">
                <p className="text-orange-800 font-bold text-sm mb-2">
                  ⚠ {resetPreview}名の有効期間がリセットされます
                </p>
                <p className="text-xs text-orange-600 mb-3">
                  この操作は取り消せません。PINを再入力してください。
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="PIN"
                    value={resetPin}
                    onChange={(e) => setResetPin(e.target.value)}
                    className="border rounded px-2 py-1.5 w-24 text-black text-center text-sm"
                  />
                  <button
                    onClick={async () => {
                      if (!window.confirm(`本当に${resetPreview}名の有効期間をリセットしますか？`)) return;
                      setResetStatus('loading');
                      try {
                        const res = await fetch("/api/admin/reset-year", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ pin: resetPin, confirm: true }),
                        });
                        if (res.ok) {
                          setResetStatus('done');
                          mutate();
                        } else {
                          const data = await res.json();
                          alert(data.error || "リセットに失敗しました");
                          setResetStatus('preview');
                        }
                      } catch {
                        alert("通信エラーが発生しました");
                        setResetStatus('preview');
                      }
                    }}
                    disabled={!resetPin}
                    className="text-sm bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded transition disabled:bg-gray-400"
                  >
                    実行
                  </button>
                  <button
                    onClick={() => { setResetStatus('idle'); setResetPin(''); }}
                    className="text-sm bg-gray-300 text-gray-700 py-1.5 px-3 rounded hover:bg-gray-400"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {resetStatus === 'done' && (
              <div className="bg-green-50 text-green-700 p-3 rounded border border-green-200 text-sm">
                ✅ {resetPreview}名の有効期間をリセットしました。
              </div>
            )}
          </div>
        </details>
      </div>
    </div >
  );
}
