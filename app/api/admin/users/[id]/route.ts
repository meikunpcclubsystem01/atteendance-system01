import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = id;
    const body = await req.json();
    
    // フロントエンドからは "YYYY-MM-DD" で送られてくる想定。
    // そのまま new Date() すると UTC の 00:00:00 (JST の 09:00:00) となってしまうため、
    // 明示的に JST (+09:00) の時刻文字列として処理する
    const validFrom = body.validFrom ? new Date(`${body.validFrom}T00:00:00+09:00`) : null;
    const validUntil = body.validUntil ? new Date(`${body.validUntil}T23:59:59+09:00`) : null;

    if (validFrom && isNaN(validFrom.getTime())) {
      return NextResponse.json({ error: "Invalid validFrom date format" }, { status: 400 });
    }
    if (validUntil && isNaN(validUntil.getTime())) {
      return NextResponse.json({ error: "Invalid validUntil date format" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { validFrom, validUntil }
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
