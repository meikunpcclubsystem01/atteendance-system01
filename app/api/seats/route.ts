import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const usersIn = await prisma.user.findMany({
      where: {
        currentStatus: "IN",
        currentSeat: { not: null }
      },
      select: { currentSeat: true }
    });

    // 現在使用中の座席番号を配列で返す
    const occupiedSeats = usersIn.map(u => u.currentSeat);
    return NextResponse.json({ occupiedSeats });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch seats" }, { status: 500 });
  }
}
