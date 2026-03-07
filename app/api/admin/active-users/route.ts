import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 常に最新データを取得させるため、キャッシュを無効化する設定
export const dynamic = 'force-dynamic';

export async function GET() {
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
        email: true,
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