import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.NEXTAUTH_SECRET || "default_secret_key";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // QRコードに埋め込むデータ（ペイロード）
  const payload = {
    userId: session.user.id,
    studentId: session.user.studentId,
    timestamp: Date.now(),
  };

  // 30秒だけ有効なトークンを生成
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "30s" });

  return NextResponse.json({ token });
}