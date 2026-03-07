import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import jwt from "jsonwebtoken";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 脆弱性対策：ハードコードされたシークレットのフォールバックを削除し、環境変数が未設定の場合はエラーにする
  if (!process.env.NEXTAUTH_SECRET) {
    console.error("NEXTAUTH_SECRET is not set in environment variables.");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // QRコードに埋め込むデータ（ペイロード）
  const payload = {
    userId: session.user.id,
    studentId: session.user.studentId,
    timestamp: Date.now(),
  };

  // 30秒だけ有効なトークンを生成
  const token = jwt.sign(payload, process.env.NEXTAUTH_SECRET, { expiresIn: "30s" });

  return NextResponse.json({ token });
}