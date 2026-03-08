import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { recordAdminLog } from "@/lib/adminLog";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
  }

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

    await recordAdminLog(session.user.email, "Force Logout", `User ${result[0].name} (ID: ${userId}) was force logged out.`);

    return NextResponse.json({
      success: true,
      user: {
        name: result[0].name,
        currentStatus: result[0].currentStatus,
      },
    });
  } catch (error) {
    console.error("Force logout error:", error);
    return NextResponse.json({ error: "Failed to force logout" }, { status: 500 });
  }
}
