import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get("token");

        if (!token || typeof token !== "string" || token.length > 2048) {
            return NextResponse.json({ error: "Missing token" }, { status: 400 });
        }

        if (!process.env.NEXTAUTH_SECRET || !process.env.NEXTAUTH_URL) {
            return NextResponse.json({ error: "Server error" }, { status: 500 });
        }

        interface TokenPayload {
            userId: string;
            newParentEmail: string;
            purpose?: string;
        }

        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as TokenPayload;

        if (decoded.purpose !== "email_change") {
            return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
        }

        if (!decoded.userId || typeof decoded.userId !== "string" || decoded.userId.length > 100) {
            return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
        }

        if (!decoded.newParentEmail || typeof decoded.newParentEmail !== "string") {
            return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
        }

        // セキュリティ: トークン内のメールアドレス形式を検証
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (decoded.newParentEmail.length > 255 || !emailRegex.test(decoded.newParentEmail)) {
            return NextResponse.json({ error: "Invalid email in token" }, { status: 400 });
        }

        // データベースを更新
        await prisma.user.update({
            where: { id: decoded.userId },
            data: { parentEmail: decoded.newParentEmail }
        });

        // 成功ページへリダイレクト
        return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/confirm-email?success=true`);

    } catch (error) {
        console.error("Confirm parent email error:", error);

        const baseUrl = process.env.NEXTAUTH_URL;
        if (!baseUrl) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }
        return NextResponse.redirect(`${baseUrl}/confirm-email?success=false`);
    }
}
