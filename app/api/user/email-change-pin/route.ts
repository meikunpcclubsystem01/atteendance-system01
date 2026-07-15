import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendEmailChangePinEmail } from "@/lib/mail";
import { checkRateLimit } from "@/lib/rateLimit";

function hashPin(pin: string): string {
    return crypto.createHash("sha256").update(pin).digest("hex");
}

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // レートリミット: 1日3回まで
        const rateCheck = checkRateLimit("email_change_pin", session.user.id, 3, 24 * 60 * 60 * 1000);
        if (!rateCheck.allowed) {
            return NextResponse.json({ error: "PINの送信上限に達しました。明日再試行してください" }, { status: 429 });
        }

        // ユーザー情報を取得
        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 保護者メールが登録されているか確認
        if (!user.parentEmail || !user.guardianVerifiedAt) {
            return NextResponse.json({ error: "保護者のメールアドレスが登録されていません。管理者にお問い合わせください" }, { status: 400 });
        }

        // クールダウンチェック: 前回変更から30日以内はエラー
        if (user.parentEmailChangedAt) {
            const cooldownMs = 30 * 24 * 60 * 60 * 1000; // 30日
            const timeSinceLastChange = Date.now() - user.parentEmailChangedAt.getTime();
            if (timeSinceLastChange < cooldownMs) {
                const remainingDays = Math.ceil((cooldownMs - timeSinceLastChange) / (24 * 60 * 60 * 1000));
                return NextResponse.json({
                    error: `前回の変更から30日が経過していません。あと${remainingDays}日後に再試行してください`
                }, { status: 429 });
            }
        }

        // 既存の未使用PINを無効化（上書き）
        await prisma.emailChangePin.deleteMany({
            where: { userId: user.id, verified: false }
        });

        // 4桁PINを生成
        const pin = String(crypto.randomInt(1000, 10_000));
        const hashedPin = hashPin(pin);

        // DBにPINを保存（有効期限10分）
        await prisma.emailChangePin.create({
            data: {
                userId: user.id,
                pin: hashedPin,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10分
            }
        });

        // 旧保護者メールにPINを送信
        await sendEmailChangePinEmail(
            user.parentEmail,
            user.name || "生徒",
            pin
        );

        // メールアドレスの一部をマスクして返す（UIで表示用）
        const maskedEmail = maskEmail(user.parentEmail);

        return NextResponse.json({ success: true, maskedEmail });

    } catch (error: unknown) {
        console.error("Email change PIN error:", error);
        return NextResponse.json({ error: "PINの送信に失敗しました" }, { status: 500 });
    }
}

function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!domain) return "***";
    const maskedLocal = local.length <= 2
        ? local[0] + "***"
        : local[0] + "***" + local[local.length - 1];
    return `${maskedLocal}@${domain}`;
}
