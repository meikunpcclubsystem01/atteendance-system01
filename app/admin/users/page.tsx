"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface User {
  id: string;
  studentId: string | null;
  name: string | null;
  email: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export default function AdminUsersPage() {
  const { data: users, error, mutate } = useSWR<User[]>("/api/admin/users", fetcher);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ validFrom: "", validUntil: "" });

  if (error) return <div className="p-8 text-red-500">エラーが発生しました</div>;
  if (!users) return <div className="p-8">読み込み中...</div>;

  const handleEditClick = (user: User) => {
    setEditingUserId(user.id);
    setEditForm({
      validFrom: user.validFrom ? new Date(user.validFrom).toISOString().split('T')[0] : "",
      validUntil: user.validUntil ? new Date(user.validUntil).toISOString().split('T')[0] : "",
    });
  };

  const handleSave = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validFrom: editForm.validFrom || null,
          validUntil: editForm.validUntil || null,
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

  return (
    <div className="min-h-screen bg-gray-50 text-black p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">ユーザー管理 (利用期間設定)</h1>
          <Link href="/admin" className="text-blue-500 hover:underline">
            ← 在室者リストへ戻る
          </Link>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">学籍番号</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">氏名</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">有効期間（開始）</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">有効期間（終了）</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.studentId}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{user.name}</td>

                  {editingUserId === user.id ? (
                    <>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <input
                          type="date"
                          value={editForm.validFrom}
                          onChange={(e) => setEditForm({ ...editForm, validFrom: e.target.value })}
                          className="border rounded px-2 py-1 bg-white"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <input
                          type="date"
                          value={editForm.validUntil}
                          onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })}
                          className="border rounded px-2 py-1 bg-white"
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
                          キャンセル
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.validFrom ? new Date(user.validFrom).toLocaleDateString() : "未設定"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.validUntil ? new Date(user.validUntil).toLocaleDateString() : "未設定"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleEditClick(user)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          編集
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
