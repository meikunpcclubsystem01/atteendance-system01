import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.currentStatus !== "IN") {
      return NextResponse.json({ error: "Invalid user or user is already OUT" }, { status: 400 });
    }

    const result = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { currentStatus: "OUT", currentSeat: null }
      }),
      prisma.attendanceLog.create({
        data: {
          userId: userId,
          action: "OUT",
          remarks: "管理者による修正"
        }
      })
    ]);

    return NextResponse.json({ success: true, user: result[0] });
  } catch (error) {
    console.error("Force logout error:", error);
    return NextResponse.json({ error: "Failed to force logout" }, { status: 500 });
  }
}
