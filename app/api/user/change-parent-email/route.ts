import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { sendEmailChangeNotification, sendParentEmailChangeConfirmation } from "@/lib/mail";
import { checkRateLimit } from "@/lib/rateLimit";
import { isSchoolMailbox, normalizeEmail } from "@/lib/security/email";

class EmailChangeError extends Error {}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const rateCheck = checkRateLimit("email_change", session.user.id, 3, 24 * 60 * 60 * 1000);
        if (!rateCheck.allowed) {
            return NextResponse.json({ error: "メール送信の上限に達しました。明日再試行してください" }, { status: 429 });
        }
        if (!process.env.NEXTAUTH_SECRET || !process.env.NEXTAUTH_URL) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        const { newParentEmail, verifiedToken } = await req.json();
        const normalizedParentEmail = normalizeEmail(newParentEmail);
        if (!normalizedParentEmail) {
            return NextResponse.json({ error: "不正なメールアドレス形式です" }, { status: 400 });
        }
        const allowedDomain = process.env.ALLOWED_DOMAIN || "niigata-meikun.ed.jp";
        if (isSchoolMailbox(normalizedParentEmail, allowedDomain)) {
            return NextResponse.json({ error: "学校のメールアドレスは保護者メールとして登録できません" }, { status: 400 });
        }
        if (!verifiedToken || typeof verifiedToken !== "string" || verifiedToken.length > 2048) {
            return NextResponse.json({ error: "確認コードの検証が完了していません" }, { status: 400 });
        }

        let verifiedPayload: { userId?: string; purpose?: string; pinId?: string };
        try {
            verifiedPayload = jwt.verify(verifiedToken, process.env.NEXTAUTH_SECRET) as typeof verifiedPayload;
        } catch {
            return NextResponse.json({ error: "確認コードの検証が期限切れです。最初からやり直してください" }, { status: 400 });
        }
        if (
            verifiedPayload.purpose !== "pin_verified" ||
            verifiedPayload.userId !== session.user.id ||
            !verifiedPayload.pinId
        ) {
            return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { id: session.user.id } });
        if (!user || !user.parentEmail || !user.guardianVerifiedAt) {
            return NextResponse.json({ error: "確認済みの保護者メールが登録されていません" }, { status: 400 });
        }
        if (normalizeEmail(user.parentEmail) === normalizedParentEmail) {
            return NextResponse.json({ error: "現在と同じメールアドレスです" }, { status: 400 });
        }
        if (user.parentEmailChangedAt) {
            const cooldownMs = 30 * 24 * 60 * 60 * 1000;
            const remaining = cooldownMs - (Date.now() - user.parentEmailChangedAt.getTime());
            if (remaining > 0) {
                return NextResponse.json({ error: `前回の変更から30日が経過していません。あと${Math.ceil(remaining / 86_400_000)}日後に再試行してください` }, { status: 429 });
            }
        }

        const token = jwt.sign(
            {
                userId: user.id,
                newParentEmail: normalizedParentEmail,
                guardianVersion: user.guardianVersion,
                purpose: "email_change",
                nonce: crypto.randomUUID(),
            },
            process.env.NEXTAUTH_SECRET,
            { expiresIn: "7d" },
        );
        const hash = crypto.createHash("sha256").update(token).digest("hex");
        const now = new Date();

        await prisma.$transaction(async (tx) => {
            const consumed = await tx.emailChangePin.updateMany({
                where: {
                    id: verifiedPayload.pinId,
                    userId: user.id,
                    verified: true,
                    consumedAt: null,
                    expiresAt: { gt: now },
                },
                data: { consumedAt: now },
            });
            if (consumed.count !== 1) throw new EmailChangeError("PIN_ALREADY_USED");

            await tx.emailChangeToken.updateMany({
                where: { userId: user.id, usedAt: null, revokedAt: null },
                data: { revokedAt: now },
            });
            await tx.emailChangeToken.create({
                data: {
                    tokenHash: hash,
                    userId: user.id,
                    newParentEmail: normalizedParentEmail,
                    guardianVersion: user.guardianVersion,
                    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
                },
            });
        });

        const confirmLink = `${process.env.NEXTAUTH_URL}/confirm-email?token=${encodeURIComponent(token)}`;
        await sendParentEmailChangeConfirmation(normalizedParentEmail, user.name || "生徒", confirmLink);
        await sendEmailChangeNotification(user.parentEmail, user.name || "生徒");
        return NextResponse.json({ success: true, message: "確認メールを送信しました" });
    } catch (error) {
        if (error instanceof EmailChangeError) {
            return NextResponse.json({ error: "確認コードは既に使用済みです。最初からやり直してください" }, { status: 400 });
        }
        console.error("Change parent email error:", error);
        return NextResponse.json({ error: "メールアドレスの変更に失敗しました" }, { status: 500 });
    }
}
