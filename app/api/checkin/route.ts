import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { sendNotificationEmail } from "@/lib/mail";

const SECRET_KEY = process.env.NEXTAUTH_SECRET || "default_secret_key";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    // トークン検証
    const decoded: any = jwt.verify(token, SECRET_KEY);
    const userId = decoded.userId;

    // ユーザー取得
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ステータス反転
    const newStatus = user.currentStatus === "IN" ? "OUT" : "IN";

    // DB更新
    const result = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { currentStatus: newStatus },
      }),
      prisma.attendanceLog.create({
        data: {
          userId: userId,
          action: newStatus,
        },
      }),
    ]);

    // メール送信（非同期）
    if (user.parentEmail) {
      sendNotificationEmail(
        user.parentEmail,
        user.name || "生徒",
        newStatus as "IN" | "OUT",
        new Date()
      ).catch(err => console.error("Email error inside API:", err));
    }

    return NextResponse.json({
      success: true,
      user: result[0],
      action: newStatus,
    });

  } catch (error) {
    console.error("Checkin error:", error);
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}