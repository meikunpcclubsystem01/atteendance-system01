import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  // 誰がログインしているか確認する
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    return NextResponse.json({ error: "ログインしていません" }, { status: 401 });
  }

  // 送られてきた名前と保護者メールアドレスを受け取る
  const { name, parentEmail } = await req.json();

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "名前が正しくありません" }, { status: 400 });
  }

  // 簡単なメールアドレスフォーマットの検証
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!parentEmail || typeof parentEmail !== "string" || !emailRegex.test(parentEmail)) {
    return NextResponse.json({ error: "不正なメールアドレス形式です" }, { status: 400 });
  }

  // データベースを更新して、isRegistered (登録済み) を true にする
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: name,
      parentEmail: parentEmail,
      isRegistered: true,
    },
  });

  return NextResponse.json({ success: true });
}