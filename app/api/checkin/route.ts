import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/mail";
import { attendanceEligibilityError } from "@/lib/security/attendance";

class CheckinError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const DEFAULT_SEATS = Array.from({ length: 30 }, (_, index) => `${index + 1}番`);

async function performCheckin(userId: string, requestedSeat: unknown) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attendance-user:${userId}`}))`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new CheckinError("User not found", 404);

        const now = new Date();
        const eligibilityError = attendanceEligibilityError(user, now);
        if (eligibilityError) throw new CheckinError(eligibilityError, 403);

        const latestLog = await tx.attendanceLog.findFirst({
          where: { userId },
          orderBy: { timestamp: "desc" },
        });
        if (latestLog && now.getTime() - latestLog.timestamp.getTime() < 60_000) {
          throw new CheckinError("連続しての打刻はできません（1分間は再アクセス不可です）", 429);
        }

        const newStatus = user.currentStatus === "IN" ? "OUT" : "IN";
        let nextSeat: string | null = null;

        if (newStatus === "IN") {
          if (typeof requestedSeat !== "string" || !requestedSeat) {
            throw new CheckinError("入室時は座席を指定してください", 400);
          }

          let validSeats = DEFAULT_SEATS;
          const setting = await tx.systemSetting.findUnique({ where: { key: "seat_layout" } });
          if (setting) {
            try {
              const layout = JSON.parse(setting.value) as (string | null)[][];
              validSeats = layout.flat().filter((seat): seat is string => seat !== null);
            } catch {
              validSeats = DEFAULT_SEATS;
            }
          }
          if (!validSeats.includes(requestedSeat)) {
            throw new CheckinError("無効な座席名です", 400);
          }

          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attendance-seat:${requestedSeat}`}))`;
          const occupied = await tx.user.findFirst({
            where: { currentSeat: requestedSeat, id: { not: userId } },
            select: { id: true },
          });
          if (occupied) {
            throw new CheckinError("その座席は他の方が使用中です。別の席を選んでください", 409);
          }
          nextSeat = requestedSeat;
        }

        const updated = await tx.user.updateMany({
          where: {
            id: userId,
            currentStatus: user.currentStatus,
            currentSeat: user.currentSeat,
            isRegistered: true,
            guardianVerifiedAt: { not: null },
            validUntil: { gte: now },
            OR: [{ validFrom: null }, { validFrom: { lte: now } }],
          },
          data: { currentStatus: newStatus, currentSeat: nextSeat },
        });
        if (updated.count !== 1) {
          throw new CheckinError("状態が更新されました。QRコードを読み直してください", 409);
        }

        await tx.attendanceLog.create({ data: { userId, action: newStatus } });
        return {
          name: user.name,
          parentEmail: user.parentEmail,
          guardianVersion: user.guardianVersion,
          currentStatus: newStatus,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) {
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CheckinError("その座席は他の方が使用中です。別の席を選んでください", 409);
      }
      throw error;
    }
  }
  throw new CheckinError("状態が競合しました。QRコードを読み直してください", 409);
}

export async function POST(req: Request) {
  try {
    const { token, seat } = await req.json();
    if (!token || typeof token !== "string" || token.length > 2048) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }
    if (!process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    let decoded: { userId?: string; purpose?: string };
    try {
      decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as typeof decoded;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
    if (decoded.purpose !== "qr" || !decoded.userId || decoded.userId.length > 100) {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
    }

    const result = await performCheckin(decoded.userId, seat);
    if (result.parentEmail) {
      sendNotificationEmail(
        result.parentEmail,
        result.name || "生徒",
        result.currentStatus as "IN" | "OUT",
        new Date(),
        decoded.userId,
        result.guardianVersion,
      ).catch((error) => console.error("Email error inside API:", error));
    }

    return NextResponse.json({
      success: true,
      user: { name: result.name, currentStatus: result.currentStatus },
      action: result.currentStatus,
    });
  } catch (error) {
    if (error instanceof CheckinError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Checkin error:", error);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
