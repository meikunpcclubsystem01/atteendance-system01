import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { recordAdminLog } from "@/lib/adminLog";

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
    if (!adminEmails.includes(session.user.email)) {
        return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    try {
        const usersIn = await prisma.user.findMany({
            where: { currentStatus: "IN" },
            select: { id: true, name: true },
        });

        if (usersIn.length === 0) {
            return NextResponse.json({ success: true, logoutCount: 0, message: "在室者はいません" });
        }

        await prisma.$transaction([
            ...usersIn.map(user => prisma.user.update({
                where: { id: user.id },
                data: { currentStatus: "OUT", currentSeat: null },
            })),
            prisma.attendanceLog.createMany({
                data: usersIn.map(user => ({
                    userId: user.id,
                    action: "OUT",
                    remarks: "管理者による一括強制退出",
                })),
            }),
        ]);

        // 管理者操作ログ
        await recordAdminLog(
            session.user.email,
            "BULK_FORCE_LOGOUT",
            `${usersIn.length}名を一括強制退出: ${usersIn.map(u => u.name || "不明").join(", ")}`
        );

        return NextResponse.json({
            success: true,
            logoutCount: usersIn.length,
            message: `${usersIn.length}名を退出させました`,
        });
    } catch (error) {
        console.error("Bulk force logout error:", error);
        return NextResponse.json({ error: "一括退出に失敗しました" }, { status: 500 });
    }
}
