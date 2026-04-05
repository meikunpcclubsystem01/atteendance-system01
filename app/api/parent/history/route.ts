import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get("token");

        if (!token || typeof token !== "string" || token.length > 2048) {
            return NextResponse.json({ error: "Missing token" }, { status: 400 });
        }

        if (!process.env.NEXTAUTH_SECRET) {
            return NextResponse.json({ error: "Server error" }, { status: 500 });
        }

        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as { userId: string; purpose?: string };

        if (decoded.purpose !== "parent_history") {
            return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
        }

        // セキュリティ: トークンから取得したuserIdの型・形式を検証
        if (!decoded.userId || typeof decoded.userId !== "string" || decoded.userId.length > 100) {
            return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { name: true, studentId: true },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 最新20セッション分のログを取得
        const logs = await prisma.attendanceLog.findMany({
            where: { userId: decoded.userId },
            orderBy: { timestamp: "desc" },
            take: 40,
        });

        // ログを(IN, OUT)ペアに組み立て
        const history: { date: string; inTime: string; outTime: string; duration: string }[] = [];

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            if (log.action === "OUT") {
                if (i + 1 < logs.length && logs[i + 1].action === "IN") {
                    const inLog = logs[i + 1];
                    const durationMs = log.timestamp.getTime() - inLog.timestamp.getTime();
                    const totalMin = Math.floor(durationMs / 60000);
                    const hours = Math.floor(totalMin / 60);
                    const mins = totalMin % 60;

                    history.push({
                        date: inLog.timestamp.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }),
                        inTime: inLog.timestamp.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }),
                        outTime: log.timestamp.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }),
                        duration: hours > 0 ? `${hours}時間${mins}分` : `${mins}分`,
                    });
                    i++;
                }
            } else if (log.action === "IN") {
                history.push({
                    date: log.timestamp.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }),
                    inTime: log.timestamp.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }),
                    outTime: "利用中",
                    duration: "-",
                });
            }
        }

        return NextResponse.json({
            studentName: user.name || user.studentId,
            history,
        });
    } catch (error) {
        console.error("Parent history error:", error);
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
}
