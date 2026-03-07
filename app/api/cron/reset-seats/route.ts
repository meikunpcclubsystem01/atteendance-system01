import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // 定期実行APIの保護：環境変数 CRON_SECRET が設定されており、かつ Authorization: Bearer <secret> と一致する場合のみ許可
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized request" }, { status: 401 });
    }

    const usersIn = await prisma.user.findMany({
      where: { currentStatus: "IN" }
    });
    
    if (usersIn.length > 0) {
      await prisma.$transaction([
        ...usersIn.map(user => prisma.user.update({
          where: { id: user.id },
          data: { currentStatus: "OUT", currentSeat: null }
        })),
        prisma.attendanceLog.createMany({
          data: usersIn.map(user => ({
            userId: user.id,
            action: "OUT",
            remarks: "システムによる自動退出（日次リセット）"
          }))
        })
      ]);
    }

    return NextResponse.json({ success: true, resetCount: usersIn.length });
  } catch (error) {
    console.error("Reset seats error:", error);
    return NextResponse.json({ error: "Failed to reset seats" }, { status: 500 });
  }
}
