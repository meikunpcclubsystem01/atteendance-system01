import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { attendanceEligibilityError } from "@/lib/security/attendance";
import { getAdminSession } from "@/lib/security/adminAuth";

export async function POST(req: Request) {
    try {
        // なりすまし打刻対策: スキャナー端末（管理者セッション）からの呼び出しに限定する
        const adminSession = await getAdminSession();
        if (!adminSession) {
            return NextResponse.json({ error: "スキャナー端末からのみ実行できます" }, { status: 403 });
        }

        const { token } = await req.json();

        if (!token || typeof token !== "string" || token.length > 2048) {
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

        // セキュリティ: トークンから取得したuserIdの型・形式を検証
        if (!userId || typeof userId !== "string" || userId.length > 100) {
            return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
        }

        // ユーザー取得
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                studentId: true,
                currentStatus: true,
                isRegistered: true,
                guardianVerifiedAt: true,
                validFrom: true,
                validUntil: true,
            }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const now = new Date();

        const eligibilityError = attendanceEligibilityError(user, now);
        if (eligibilityError) {
            return NextResponse.json({ error: eligibilityError }, { status: 403 });
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
