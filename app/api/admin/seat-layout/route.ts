import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

// デフォルトの座席レイアウト
const DEFAULT_LAYOUT = [
    ["1番", "2番", "3番", "4番", "5番"],
    ["6番", "7番", "8番", "9番", "10番"],
    [null, null, null, null, null],
    ["11番", "12番", "13番", "14番", "15番"],
    ["16番", "17番", "18番", "19番", "20番"],
    [null, null, null, null, null],
    ["21番", "22番", "23番", "24番", "25番"],
    ["26番", "27番", "28番", "29番", "30番"],
];

// GET: 現在の座席レイアウトを取得
export async function GET() {
    try {
        const setting = await prisma.systemSetting.findUnique({
            where: { key: "seat_layout" },
        });

        const layout = setting ? JSON.parse(setting.value) : DEFAULT_LAYOUT;
        return NextResponse.json({ layout });
    } catch (error) {
        console.error("Failed to fetch seat layout:", error);
        return NextResponse.json({ layout: DEFAULT_LAYOUT });
    }
}

// PUT: 座席レイアウトを更新（管理者のみ）
export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
    if (!adminEmails.includes(session.user.email)) {
        return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    try {
        const { layout } = await req.json();

        // バリデーション: 配列の配列であること
        if (!Array.isArray(layout) || layout.length === 0) {
            return NextResponse.json({ error: "レイアウトは配列形式で指定してください" }, { status: 400 });
        }

        for (const row of layout) {
            if (!Array.isArray(row)) {
                return NextResponse.json({ error: "各行は配列形式で指定してください" }, { status: 400 });
            }
            for (const cell of row) {
                if (cell !== null && typeof cell !== "string") {
                    return NextResponse.json({ error: "各セルは文字列またはnullで指定してください" }, { status: 400 });
                }
            }
        }

        // 座席名の重複チェック
        const seatNames = layout.flat().filter((s: string | null): s is string => s !== null);
        const uniqueNames = new Set(seatNames);
        if (seatNames.length !== uniqueNames.size) {
            return NextResponse.json({ error: "座席名が重複しています" }, { status: 400 });
        }

        await prisma.systemSetting.upsert({
            where: { key: "seat_layout" },
            update: { value: JSON.stringify(layout) },
            create: { key: "seat_layout", value: JSON.stringify(layout) },
        });

        return NextResponse.json({ success: true, seatCount: seatNames.length });
    } catch (error) {
        console.error("Failed to update seat layout:", error);
        return NextResponse.json({ error: "レイアウトの保存に失敗しました" }, { status: 500 });
    }
}
