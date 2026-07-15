import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

function hashPin(pin: string): string {
    return crypto.createHash("sha256").update(pin).digest("hex");
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!process.env.NEXTAUTH_SECRET) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        const { pin } = await req.json();
        if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
            return NextResponse.json({ error: "4桁の確認コードを入力してください" }, { status: 400 });
        }

        const pinRecord = await prisma.emailChangePin.findFirst({
            where: { userId: session.user.id, verified: false, consumedAt: null },
            orderBy: { createdAt: "desc" },
        });
        if (!pinRecord) {
            return NextResponse.json({ error: "確認コードが見つかりません。再度PINを送信してください" }, { status: 400 });
        }

        const now = new Date();
        if (now > pinRecord.expiresAt) {
            await prisma.emailChangePin.deleteMany({ where: { id: pinRecord.id, verified: false } });
            return NextResponse.json({ error: "確認コードの有効期限が切れました。再度PINを送信してください" }, { status: 400 });
        }

        const hashedInput = hashPin(pin);
        const verified = await prisma.emailChangePin.updateMany({
            where: {
                id: pinRecord.id,
                userId: session.user.id,
                pin: hashedInput,
                verified: false,
                consumedAt: null,
                expiresAt: { gt: now },
                attempts: { lt: 5 },
            },
            data: { verified: true, verifiedAt: now },
        });

        if (verified.count === 1) {
            const verifiedToken = jwt.sign(
                { userId: session.user.id, purpose: "pin_verified", pinId: pinRecord.id, nonce: crypto.randomUUID() },
                process.env.NEXTAUTH_SECRET,
                { expiresIn: "15m" },
            );
            return NextResponse.json({ success: true, verifiedToken });
        }

        const failed = await prisma.emailChangePin.updateMany({
            where: {
                id: pinRecord.id,
                userId: session.user.id,
                pin: { not: hashedInput },
                verified: false,
                consumedAt: null,
                expiresAt: { gt: now },
                attempts: { lt: 5 },
            },
            data: { attempts: { increment: 1 } },
        });
        if (failed.count !== 1) {
            return NextResponse.json({ error: "試行回数の上限に達したか、確認コードは既に使用されています" }, { status: 429 });
        }

        const current = await prisma.emailChangePin.findUnique({ where: { id: pinRecord.id } });
        const remaining = Math.max(0, 5 - (current?.attempts ?? 5));
        return NextResponse.json({ error: `確認コードが正しくありません（残り${remaining}回）` }, { status: 400 });
    } catch (error) {
        console.error("Email change verify PIN error:", error);
        return NextResponse.json({ error: "確認コードの検証に失敗しました" }, { status: 500 });
    }
}
