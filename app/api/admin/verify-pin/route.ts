import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import crypto from "crypto";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
    if (!adminEmails.includes(session.user.email)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { pin, action, targetId } = await req.json();

    if (action !== undefined && action !== "DELETE_USER") {
        return NextResponse.json({ error: "Unsupported step-up action" }, { status: 400 });
    }
    if (action === "DELETE_USER" && (!targetId || typeof targetId !== "string" || targetId.length > 100)) {
        return NextResponse.json({ error: "Invalid target" }, { status: 400 });
    }

    // #1 PINブルートフォース対策: 5回失敗で15分ロック
    const rateLimitKey = session.user.email;
    const rateCheck = checkRateLimit("pin_verify", rateLimitKey, 5, 15 * 60 * 1000, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
        const retryMin = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
        return NextResponse.json(
            { error: `試行回数の上限に達しました。${retryMin}分後に再試行してください` },
            { status: 429 }
        );
    }

    const adminPin = process.env.ADMIN_PIN;
    if (!adminPin) {
        console.error("ADMIN_PIN is not set in environment variables.");
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // #7 タイミング攻撃対策: crypto.timingSafeEqual を使用
    const pinBuffer = Buffer.from(String(pin).padEnd(64, "\0"));
    const adminPinBuffer = Buffer.from(String(adminPin).padEnd(64, "\0"));
    const isValid = crypto.timingSafeEqual(pinBuffer, adminPinBuffer);

    if (isValid) {
        resetRateLimit("pin_verify", rateLimitKey);
        if (action === "DELETE_USER") {
            const stepUpToken = crypto.randomBytes(32).toString("base64url");
            const tokenHash = crypto.createHash("sha256").update(stepUpToken).digest("hex");
            await prisma.adminStepUpGrant.create({
                data: {
                    tokenHash,
                    adminEmail: session.user.email,
                    action,
                    targetId,
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                },
            });
            return NextResponse.json({ success: true, stepUpToken });
        }
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "暗証番号が正しくありません" }, { status: 401 });
}
