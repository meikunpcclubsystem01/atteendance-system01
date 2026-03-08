import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

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

export async function GET() {
  try {
    const usersIn = await prisma.user.findMany({
      where: {
        currentStatus: "IN",
        currentSeat: { not: null }
      },
      select: { currentSeat: true }
    });

    const occupiedSeats = usersIn.map(u => u.currentSeat);

    // 座席レイアウトも一緒に返す
    let layout = DEFAULT_LAYOUT;
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "seat_layout" },
      });
      if (setting) layout = JSON.parse(setting.value);
    } catch {
      // レイアウト取得失敗時はデフォルトを使用
    }

    return NextResponse.json({ occupiedSeats, layout });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch seats" }, { status: 500 });
  }
}
