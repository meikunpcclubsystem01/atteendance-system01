import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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
        // 過去6ヶ月分の月別データを計算
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const logs = await prisma.attendanceLog.findMany({
            where: {
                timestamp: { gte: sixMonthsAgo },
                action: "IN",
            },
            select: { userId: true, timestamp: true, seat: true },
            orderBy: { timestamp: "asc" },
        });

        // 月別利用者数（INの数をカウント）
        const monthlyMap: Record<string, { sessions: number; uniqueUsers: Set<string> }> = {};
        logs.forEach(log => {
            const d = new Date(log.timestamp);
            const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
            const key = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyMap[key]) monthlyMap[key] = { sessions: 0, uniqueUsers: new Set() };
            monthlyMap[key].sessions++;
            monthlyMap[key].uniqueUsers.add(log.userId);
        });

        const monthly = Object.entries(monthlyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({
                month,
                sessions: data.sessions,
                uniqueUsers: data.uniqueUsers.size,
            }));

        // 曜日別平均利用者数
        const dayOfWeekMap: Record<number, { total: number; days: Set<string> }> = {};
        for (let i = 0; i < 7; i++) dayOfWeekMap[i] = { total: 0, days: new Set() };

        logs.forEach(log => {
            const d = new Date(log.timestamp);
            const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
            const dow = jst.getDay();
            const dateKey = jst.toISOString().split('T')[0];
            dayOfWeekMap[dow].total++;
            dayOfWeekMap[dow].days.add(dateKey);
        });

        const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
        const weekday = Object.entries(dayOfWeekMap).map(([dow, data]) => ({
            day: dayNames[Number(dow)],
            avg: data.days.size > 0 ? Math.round(data.total / data.days.size * 10) / 10 : 0,
            total: data.total,
        }));

        // 座席別利用回数ランキング（INログに記録された座席を集計。seat列導入前の過去ログは対象外）
        const seatCountMap: Record<string, number> = {};
        logs.forEach(log => {
            if (log.seat) {
                seatCountMap[log.seat] = (seatCountMap[log.seat] || 0) + 1;
            }
        });
        const seatRanking = Object.entries(seatCountMap)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([seat, count]) => ({ seat, count }));

        // 総利用者数・総セッション数
        const totalSessions = logs.length;
        const totalUniqueUsers = new Set(logs.map(l => l.userId)).size;

        // 登録者総数
        const totalRegistered = await prisma.user.count({
            where: { isRegistered: true }
        });

        return NextResponse.json({
            monthly,
            weekday,
            seatRanking,
            totalSessions,
            totalUniqueUsers,
            totalRegistered,
        });
    } catch (error) {
        console.error("Stats error:", error);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}
