import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { sendPermissionRequestEmail } from "@/lib/mail";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
    try {
        const { validFrom, validUntil } = await req.json();

        // 簡易的な日付形式チェック (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if ((validFrom && !dateRegex.test(validFrom)) || (validUntil && !dateRegex.test(validUntil))) {
            return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
        }

        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // #2 メールスパム対策: 1日3回まで
        const rateCheck = checkRateLimit("email_permission", session.user.id, 3, 24 * 60 * 60 * 1000);
        if (!rateCheck.allowed) {
            return NextResponse.json({ error: "メール送信の上限に達しました。明日再試行してください" }, { status: 429 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user || !user.parentEmail) {
            return NextResponse.json({ error: "Parent email not found" }, { status: 400 });
        }

        if (!process.env.NEXTAUTH_SECRET || !process.env.NEXTAUTH_URL) {
            console.error("Missing environment variables for JWT or URL.");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // 保護者向けの一時的な設定用トークンを発行（7日間有効）
        const token = jwt.sign(
            { userId: user.id, requestedValidFrom: validFrom, requestedValidUntil: validUntil, purpose: "permission_request" },
            process.env.NEXTAUTH_SECRET,
            { expiresIn: "7d" }
        );

        const magicLink = `${process.env.NEXTAUTH_URL}/parent/permission?token=${token}`;

        // メールの送信
        await sendPermissionRequestEmail(user.parentEmail, user.name || "生徒", magicLink, validFrom, validUntil);

        return NextResponse.json({ success: true, message: "Permission request email sent" });

    } catch (error: unknown) {
        console.error("Failed to send permission request:", error);
        return NextResponse.json({ error: "リクエストの送信に失敗しました" }, { status: 500 });
    }
}
