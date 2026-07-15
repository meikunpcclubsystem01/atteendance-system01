import { NextResponse } from "next/server";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

interface PermissionPayload {
    userId: string;
    guardianVersion: number;
    requestedValidFrom?: string;
    requestedValidUntil?: string;
    purpose?: string;
}

function decodePermissionToken(token: string): PermissionPayload {
    if (!process.env.NEXTAUTH_SECRET) throw new Error("SERVER_CONFIG");
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as PermissionPayload;
    if (
        decoded.purpose !== "permission_request" ||
        !decoded.userId ||
        decoded.userId.length > 100 ||
        !Number.isInteger(decoded.guardianVersion)
    ) {
        throw new Error("INVALID_TOKEN");
    }
    return decoded;
}

function tokenHash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export async function GET(req: Request) {
    try {
        const token = new URL(req.url).searchParams.get("token");
        if (!token || token.length > 2048) return NextResponse.json({ error: "Missing token" }, { status: 400 });

        const decoded = decodePermissionToken(token);
        const now = new Date();
        const [record, user] = await Promise.all([
            prisma.permissionToken.findFirst({
                where: {
                    tokenHash: tokenHash(token),
                    userId: decoded.userId,
                    guardianVersion: decoded.guardianVersion,
                    usedAt: null,
                    expiresAt: { gt: now },
                },
            }),
            prisma.user.findUnique({
                where: { id: decoded.userId },
                select: {
                    name: true,
                    studentId: true,
                    validFrom: true,
                    validUntil: true,
                    guardianVerifiedAt: true,
                    guardianVersion: true,
                },
            }),
        ]);
        if (!record || !user || !user.guardianVerifiedAt || user.guardianVersion !== decoded.guardianVersion) {
            return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
        }

        const formatJST = (date: Date | null) => {
            if (!date) return null;
            return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
        };
        return NextResponse.json({
            studentName: user.name || user.studentId,
            validFrom: formatJST(user.validFrom),
            validUntil: formatJST(user.validUntil),
            requestedValidFrom: decoded.requestedValidFrom,
            requestedValidUntil: decoded.requestedValidUntil,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "SERVER_CONFIG") {
            return NextResponse.json({ error: "Server error" }, { status: 500 });
        }
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
}

export async function POST(req: Request) {
    try {
        const { token, validFrom, validUntil } = await req.json();
        if (!token || typeof token !== "string" || token.length > 2048) {
            return NextResponse.json({ error: "Missing token" }, { status: 400 });
        }
        if (!validUntil || typeof validUntil !== "string") {
            return NextResponse.json({ error: "有効期限（終了日）の指定は必須です" }, { status: 400 });
        }
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if ((validFrom && (typeof validFrom !== "string" || !dateRegex.test(validFrom))) || !dateRegex.test(validUntil)) {
            return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
        }

        const decoded = decodePermissionToken(token);
        const fromDate = validFrom ? new Date(`${validFrom}T00:00:00+09:00`) : null;
        const untilDate = new Date(`${validUntil}T23:59:59+09:00`);
        if (Number.isNaN(untilDate.getTime()) || (fromDate && Number.isNaN(fromDate.getTime()))) {
            return NextResponse.json({ error: "Invalid date" }, { status: 400 });
        }

        const now = new Date();
        const year = now.getFullYear();
        const maxYear = now.getMonth() + 1 >= 4 ? year + 1 : year;
        const maxDate = new Date(`${maxYear}-03-31T23:59:59+09:00`);
        if (untilDate > maxDate || (fromDate && fromDate > untilDate)) {
            return NextResponse.json({ error: `有効期限は ${maxYear}年3月31日 までの有効な期間を指定してください。` }, { status: 400 });
        }

        const consumed = await prisma.$transaction(async (tx) => {
            const tokenResult = await tx.permissionToken.updateMany({
                where: {
                    tokenHash: tokenHash(token),
                    userId: decoded.userId,
                    guardianVersion: decoded.guardianVersion,
                    usedAt: null,
                    expiresAt: { gt: now },
                },
                data: { usedAt: now },
            });
            if (tokenResult.count !== 1) return false;

            const userResult = await tx.user.updateMany({
                where: {
                    id: decoded.userId,
                    guardianVersion: decoded.guardianVersion,
                    guardianVerifiedAt: { not: null },
                },
                data: { validFrom: fromDate, validUntil: untilDate },
            });
            return userResult.count === 1;
        });
        if (!consumed) {
            return NextResponse.json({ error: "このリンクは使用済み、失効済み、または期限切れです" }, { status: 400 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof Error && error.message === "SERVER_CONFIG") {
            return NextResponse.json({ error: "Server error" }, { status: 500 });
        }
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
}
