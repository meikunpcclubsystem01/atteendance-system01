import { NextResponse } from "next/server";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/security/email";

interface EmailChangePayload {
    userId?: string;
    newParentEmail?: string;
    guardianVersion?: number;
    purpose?: string;
}

class ConfirmationError extends Error {}

export async function GET(req: Request) {
    const baseUrl = process.env.NEXTAUTH_URL;
    if (!baseUrl) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    const token = new URL(req.url).searchParams.get("token");
    if (!token || token.length > 2048) {
        return NextResponse.redirect(`${baseUrl}/confirm-email?error=invalid`);
    }
    return NextResponse.redirect(`${baseUrl}/confirm-email?token=${encodeURIComponent(token)}`);
}

export async function POST(req: Request) {
    try {
        if (!process.env.NEXTAUTH_SECRET) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }
        const { token } = await req.json();
        if (!token || typeof token !== "string" || token.length > 2048) {
            return NextResponse.json({ error: "Missing token" }, { status: 400 });
        }

        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as EmailChangePayload;
        const normalizedEmail = normalizeEmail(decoded.newParentEmail);
        if (
            decoded.purpose !== "email_change" ||
            !decoded.userId || decoded.userId.length > 100 ||
            !normalizedEmail || !Number.isInteger(decoded.guardianVersion)
        ) {
            return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
        }

        const hash = crypto.createHash("sha256").update(token).digest("hex");
        const now = new Date();
        await prisma.$transaction(async (tx) => {
            const record = await tx.emailChangeToken.updateMany({
                where: {
                    tokenHash: hash,
                    userId: decoded.userId,
                    newParentEmail: normalizedEmail,
                    guardianVersion: decoded.guardianVersion,
                    usedAt: null,
                    revokedAt: null,
                    expiresAt: { gt: now },
                },
                data: { usedAt: now },
            });
            if (record.count !== 1) throw new ConfirmationError("INVALID_OR_USED");

            const user = await tx.user.findUnique({ where: { id: decoded.userId } });
            if (!user || user.guardianVersion !== decoded.guardianVersion) {
                throw new ConfirmationError("STALE_GUARDIAN");
            }
            const updated = await tx.user.updateMany({
                where: { id: decoded.userId, guardianVersion: decoded.guardianVersion },
                data: {
                    parentEmail: normalizedEmail,
                    parentEmailChangedAt: now,
                    guardianVerifiedAt: now,
                    guardianVersion: { increment: 1 },
                },
            });
            if (updated.count !== 1) throw new ConfirmationError("STALE_GUARDIAN");

            await tx.permissionToken.updateMany({
                where: { userId: decoded.userId, usedAt: null },
                data: { usedAt: now },
            });
            await tx.adminLog.create({
                data: {
                    adminEmail: "SYSTEM",
                    action: "PARENT_EMAIL_CHANGE",
                    details: `保護者メール変更: ${user.name || "不明"} (${user.studentId || decoded.userId}) / ${user.parentEmail || "未登録"} → ${normalizedEmail}`,
                },
            });
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof ConfirmationError) {
            return NextResponse.json({ error: "このリンクは使用済み、失効済み、または期限切れです" }, { status: 400 });
        }
        console.error("Confirm parent email error:", error);
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
}
