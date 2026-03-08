import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// 常に最新データを取得させるため、キャッシュを無効化する設定
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
  }

  try {
    // ステータスが "IN" (在室) のユーザーを全員取得
    const activeUsers = await prisma.user.findMany({
      where: {
        currentStatus: "IN",
      },
      select: {
        id: true,
        studentId: true,
        name: true,
        currentSeat: true,
        logs: {
          select: {
            timestamp: true
          },
          orderBy: {
            timestamp: 'desc'
          },
          take: 1
        }
      },
      orderBy: {
        studentId: 'asc', // 学籍番号順に並べる
      },
    });

    return NextResponse.json(activeUsers);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}