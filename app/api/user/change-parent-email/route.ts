import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { sendParentEmailChangeConfirmation } from "@/lib/mail";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // #2 メールスパム対策: 1日3回まで
        const rateCheck = checkRateLimit("email_change", session.user.id, 3, 24 * 60 * 60 * 1000);
        if (!rateCheck.allowed) {
            return NextResponse.json({ error: "メール送信の上限に達しました。明日再試行してください" }, { status: 429 });
        }

        const { newParentEmail } = await req.json();

        // バリデーション
        if (!newParentEmail || typeof newParentEmail !== "string") {
            return NextResponse.json({ error: "メールアドレスを入力してください" }, { status: 400 });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (newParentEmail.length > 255 || !emailRegex.test(newParentEmail)) {
            return NextResponse.json({ error: "不正なメールアドレス形式です" }, { status: 400 });
        }

        // 学校ドメインのブロック（生徒が自分のメールを登録するのを防ぐ）
        const allowedDomain = process.env.ALLOWED_DOMAIN || "niigata-meikun.ed.jp";
        if (newParentEmail.endsWith(`@${allowedDomain}`)) {
            return NextResponse.json({ error: "学校のメールアドレスは保護者メールとして登録できません" }, { status: 400 });
        }

        // 現在のユーザー情報を取得
        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 同じメールアドレスへの変更を防止
        if (user.parentEmail === newParentEmail) {
            return NextResponse.json({ error: "現在と同じメールアドレスです" }, { status: 400 });
        }

        if (!process.env.NEXTAUTH_SECRET || !process.env.NEXTAUTH_URL) {
            console.error("Missing environment variables for JWT or URL.");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // 確認用トークンを発行（7日間有効）
        const token = jwt.sign(
            { userId: user.id, newParentEmail, purpose: "email_change" },
            process.env.NEXTAUTH_SECRET,
            { expiresIn: "7d" }
        );

        const confirmLink = `${process.env.NEXTAUTH_URL}/api/user/confirm-parent-email?token=${token}`;

        // 新しいメールアドレスに確認メールを送信
        await sendParentEmailChangeConfirmation(
            newParentEmail,
            user.name || "生徒",
            confirmLink
        );

        return NextResponse.json({ success: true, message: "確認メールを送信しました" });

    } catch (error: unknown) {
        console.error("Change parent email error:", error);
        return NextResponse.json({ error: "メールアドレスの変更に失敗しました" }, { status: 500 });
    }
}
