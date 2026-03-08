import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import crypto from "crypto";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
    if (!adminEmails.includes(session.user.email)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const { pin } = await req.json();

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
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "暗証番号が正しくありません" }, { status: 401 });
}
