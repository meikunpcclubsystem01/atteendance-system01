"use client";

import useSWR from "swr";
import Link from "next/link";

// データを取得するための関数
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface User {
  id: string;
  studentId: string;
  name: string;
  email: string;
}

export default function AdminPage() {
  // 3秒ごとに自動でデータを再取得する設定
  const { data: users, error } = useSWR<User[]>("/api/admin/active-users", fetcher, {
    refreshInterval: 3000,
  });

  if (error) return <div className="p-8 text-red-500">エラーが発生しました</div>;
  if (!users) return <div className="p-8">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-black p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">在室者リスト (管理画面)</h1>
          <div className="text-right">
            <span className="bg-green-100 text-green-800 text-lg font-bold px-4 py-2 rounded-full">
              現在 {users.length} 名
            </span>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  学籍番号
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  氏名
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  メールアドレス
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  状態
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    現在、在室している生徒はいません。
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.studentId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        在室中
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-blue-500 underline hover:text-blue-700">
            トップページへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}