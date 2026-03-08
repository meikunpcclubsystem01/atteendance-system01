import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
    try {
        const { token } = await req.json();

        if (!token) {
            return NextResponse.json({ error: "No token provided" }, { status: 400 });
        }

        if (!process.env.NEXTAUTH_SECRET) {
            console.error("NEXTAUTH_SECRET is not set in environment variables.");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // トークン検証
        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as { userId: string; purpose?: string };
        if (decoded.purpose !== "qr") {
            return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
        }
        const userId = decoded.userId;

        // ユーザー取得
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                studentId: true,
                currentStatus: true,
                validFrom: true,
                validUntil: true,
            }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const now = new Date();

        // 保護者による利用許可機能（有効期限管理）
        if (user.validFrom && now < user.validFrom) {
            return NextResponse.json({ error: "利用開始日前です" }, { status: 403 });
        }
        if (user.validUntil && now > user.validUntil) {
            return NextResponse.json({ error: "利用有効期限が切れています" }, { status: 403 });
        }

        // 二重読み込み防止ロジック
        const latestLog = await prisma.attendanceLog.findFirst({
            where: { userId: userId },
            orderBy: { timestamp: 'desc' },
        });

        if (latestLog) {
            const timeDiff = now.getTime() - new Date(latestLog.timestamp).getTime();
            if (timeDiff < 60 * 1000) { // 1分 (60000ms) 以内
                return NextResponse.json({ error: "連続しての打刻はできません（1分間は再アクセス不可です）" }, { status: 429 });
            }
        }

        // ユーザー情報と次のアクションに必要なステータスを返す
        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                studentId: user.studentId,
                currentStatus: user.currentStatus,
            },
        });

    } catch (error) {
        console.error("Scanner verify error:", error);
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
}
