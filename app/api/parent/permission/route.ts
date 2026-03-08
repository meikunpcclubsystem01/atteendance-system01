import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// GET: マジックリンクの有効性確認と、現在の設定取得
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get("token");

        if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

        if (!process.env.NEXTAUTH_SECRET) {
            return NextResponse.json({ error: "Server error" }, { status: 500 });
        }

        interface TokenPayload {
            userId: string;
            requestedValidFrom?: string;
            requestedValidUntil?: string;
        }

        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as TokenPayload;

        if ((decoded as TokenPayload & { purpose?: string }).purpose !== "permission_request") {
            return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { name: true, studentId: true, validFrom: true, validUntil: true }
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const formatJST = (d: Date | null) => {
            if (!d) return null;
            const jstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
            return jstDate.toISOString().split('T')[0];
        };

        return NextResponse.json({
            studentName: user.name || user.studentId,
            validFrom: formatJST(user.validFrom),
            validUntil: formatJST(user.validUntil),
            requestedValidFrom: decoded.requestedValidFrom,
            requestedValidUntil: decoded.requestedValidUntil
        });

    } catch (error) {
        console.error("Token verification failed:", error);
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
}

// POST: 保護者による期間の更新
export async function POST(req: Request) {
    try {
        const { token, validFrom, validUntil } = await req.json();

        if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

        if (!process.env.NEXTAUTH_SECRET) {
            return NextResponse.json({ error: "Server error" }, { status: 500 });
        }

        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as { userId: string; purpose?: string };

        if (decoded.purpose !== "permission_request") {
            return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
        }

        const data: { validFrom?: Date | null; validUntil?: Date | null } = {};

        if (validFrom !== undefined) data.validFrom = validFrom ? new Date(`${validFrom}T00:00:00+09:00`) : null;

        // システム仕様：有効期間は年度をまたげない（最長で今年度末の3月31日まで）、かつ必須
        if (!validUntil) {
            return NextResponse.json({ error: "有効期限（終了日）の指定は必須です" }, { status: 400 });
        }

        const untilDate = new Date(`${validUntil}T23:59:59+09:00`);
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const maxYear = m >= 4 ? y + 1 : y;
        const maxDate = new Date(`${maxYear}-03-31T23:59:59+09:00`);

        if (untilDate > maxDate) {
            return NextResponse.json({ error: `有効期限は ${maxYear}年3月31日 までしか設定できません。` }, { status: 400 });
        }

        data.validUntil = untilDate;

        // #3 トークンリプレイ防止: 使用済みトークンチェック
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
        const usedKey = `used_permission_${tokenHash}`;
        try {
            const used = await prisma.systemSetting.findUnique({ where: { key: usedKey } });
            if (used) {
                return NextResponse.json({ error: "このリンクは既に使用済みです" }, { status: 400 });
            }
        } catch { /* テーブルがない場合は無視 */ }

        await prisma.user.update({
            where: { id: decoded.userId },
            data
        });

        // トークンを使用済みとして記録
        try {
            await prisma.systemSetting.create({
                data: { key: usedKey, value: new Date().toISOString() }
            });
        } catch { /* 重複キーの場合は無視 */ }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Update permission failed:", error);
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
}
