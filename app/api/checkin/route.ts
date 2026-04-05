import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { sendNotificationEmail } from "@/lib/mail";

export async function POST(req: Request) {
  try {
    const { token, seat } = await req.json();

    if (!token || typeof token !== "string" || token.length > 2048) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    if (!process.env.NEXTAUTH_SECRET) {
      console.error("NEXTAUTH_SECRET is not set in environment variables.");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // トークン検証
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as { userId: string; purpose?: string };
    if (decoded.purpose !== "qr") {
      return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
    }
    const userId = decoded.userId;

    // セキュリティ: トークンから取得したuserIdの型・形式を検証
    if (!userId || typeof userId !== "string" || userId.length > 100) {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
    }

    // ユーザー取得
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();

    // 2. 保護者による利用許可機能（有効期限管理）
    if (user.validFrom && now < user.validFrom) {
      return NextResponse.json({ error: "利用開始日前です" }, { status: 403 });
    }
    if (user.validUntil && now > user.validUntil) {
      return NextResponse.json({ error: "利用有効期限が切れています" }, { status: 403 });
    }

    // 1. 二重読み込み防止ロジック
    const latestLog = await prisma.attendanceLog.findFirst({
      where: { userId: userId },
      orderBy: { timestamp: 'desc' },
    });

    if (latestLog) {
      const timeDiff = now.getTime() - new Date(latestLog.timestamp).getTime();
      if (timeDiff < 60 * 1000) { // 1分 (60000ms) 以内
        return NextResponse.json({ error: "連続しての打刻はできません（1分間は再アクセス不可です）" }, { status: 429 });
      }
    }

    // ステータス反転と座席の処理
    const newStatus = user.currentStatus === "IN" ? "OUT" : "IN";

    // 5. 座席管理と競合（ダブルブッキング）防止ロック
    let nextSeat = null;
    if (newStatus === "IN") {
      if (!seat) {
        return NextResponse.json({ error: "入室時は座席を指定してください" }, { status: 400 });
      }

      // 座席名のバリデーション：DBレイアウトに存在する座席かチェック
      const DEFAULT_SEATS = ["1番", "2番", "3番", "4番", "5番", "6番", "7番", "8番", "9番", "10番", "11番", "12番", "13番", "14番", "15番", "16番", "17番", "18番", "19番", "20番", "21番", "22番", "23番", "24番", "25番", "26番", "27番", "28番", "29番", "30番"];
      let validSeats = DEFAULT_SEATS;
      try {
        const setting = await prisma.systemSetting.findUnique({ where: { key: "seat_layout" } });
        if (setting) {
          const layout = JSON.parse(setting.value) as (string | null)[][];
          validSeats = layout.flat().filter((s): s is string => s !== null);
        }
      } catch { /* デフォルトを使用 */ }

      if (!validSeats.includes(seat)) {
        return NextResponse.json({ error: "無効な座席名です" }, { status: 400 });
      }

      // 競合チェック：リクエストされた座席が、すでに「自分以外の誰か」に使われていないか確認する
      const existingUserInSeat = await prisma.user.findFirst({
        where: {
          currentStatus: "IN",
          currentSeat: seat,
          id: { not: userId } // ←自分自身の二重スキャンの場合はエラーにしない
        }
      });

      if (existingUserInSeat) {
        return NextResponse.json({ error: "その座席はタッチの差で他の方に取られてしまいました。別の席を選んでください" }, { status: 409 });
      }

      nextSeat = seat;
    }

    // DB更新
    const result = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          currentStatus: newStatus,
          currentSeat: nextSeat
        },
      }),
      prisma.attendanceLog.create({
        data: {
          userId: userId,
          action: newStatus,
        },
      }),
    ]);

    // メール送信（非同期）
    if (user.parentEmail) {
      sendNotificationEmail(
        user.parentEmail,
        user.name || "生徒",
        newStatus as "IN" | "OUT",
        new Date(),
        userId
      ).catch(err => console.error("Email error inside API:", err));
    }

    return NextResponse.json({
      success: true,
      user: {
        name: result[0].name,
        currentStatus: result[0].currentStatus,
      },
      action: newStatus,
    });

  } catch (error) {
    console.error("Checkin error:", error);
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}