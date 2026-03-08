import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { recordAdminLog } from "@/lib/adminLog";
import crypto from "crypto";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
    if (!adminEmails.includes(session.user.email)) {
        return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    try {
        const { pin, confirm } = await req.json();

        // PIN検証（タイミングセーフ比較）
        const adminPin = process.env.ADMIN_PIN;
        if (!adminPin) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }
        const pinBuf = Buffer.from(String(pin || "").padEnd(64, "\0"));
        const adminPinBuf = Buffer.from(String(adminPin).padEnd(64, "\0"));
        if (!crypto.timingSafeEqual(pinBuf, adminPinBuf)) {
            return NextResponse.json({ error: "暗証番号が正しくありません" }, { status: 403 });
        }

        // 対象のユーザー数を取得（validFromまたはvalidUntilが設定されているユーザー）
        const targetCount = await prisma.user.count({
            where: {
                OR: [
                    { validFrom: { not: null } },
                    { validUntil: { not: null } },
                ]
            }
        });

        // confirmがfalseの場合はプレビューのみ
        if (!confirm) {
            return NextResponse.json({
                preview: true,
                targetCount,
                message: `${targetCount}名の有効期間をリセットします`,
            });
        }

        // 実行: 全ユーザーの validFrom と validUntil を null にリセット
        const result = await prisma.user.updateMany({
            where: {
                OR: [
                    { validFrom: { not: null } },
                    { validUntil: { not: null } },
                ]
            },
            data: {
                validFrom: null,
                validUntil: null,
            },
        });

        await recordAdminLog(
            session.user.email,
            "YEAR_RESET",
            `年度切り替えリセット: ${result.count}名の有効期間をリセット`
        );

        return NextResponse.json({
            success: true,
            resetCount: result.count,
            message: `${result.count}名の有効期間をリセットしました`,
        });
    } catch (error) {
        console.error("Year reset error:", error);
        return NextResponse.json({ error: "リセットに失敗しました" }, { status: 500 });
    }
}
