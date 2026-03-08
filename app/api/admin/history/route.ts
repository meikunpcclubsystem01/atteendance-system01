import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");

    // dateParamがなければ今日のJST日付文字列(YYYY-MM-DD)を取得
    let targetDateStr = dateParam;
    if (!targetDateStr) {
      const now = new Date();
      const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      targetDateStr = jstDate.toISOString().split('T')[0];
    }

    // YYYY-MM-DD 文字列に JST のオフセットを付けて Date オブジェクト化する
    const startOfDay = new Date(`${targetDateStr}T00:00:00+09:00`);
    const endOfDay = new Date(`${targetDateStr}T23:59:59+09:00`);

    // 不正な日付形式かチェック
    if (isNaN(startOfDay.getTime()) || isNaN(endOfDay.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const logs = await prisma.attendanceLog.findMany({
      where: {
        timestamp: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        user: {
          select: { name: true, studentId: true }
        }
      },
      orderBy: { timestamp: "asc" }
    });

    interface SessionData {
      inTime: Date | null;
      outTime: Date | null;
      durationMs: number;
      remarks: string | null;
    }
    interface OmitSessionData {
      userId: string;
      name: string;
      studentId: string;
      sessions: SessionData[];
      currentSession: SessionData | null;
    }

    // ユーザーごとに入退室のペアを作成
    // ※今回は簡易的に1日1回のIN/OUTペアのみ、または最新のペアのみを考慮するのではなく、複数回の出入りをまとめて表示するリスト形式にします
    const userGroups: Record<string, OmitSessionData> = {};

    logs.forEach(log => {
      const uId = log.userId;
      if (!userGroups[uId]) {
        userGroups[uId] = {
          userId: uId,
          name: log.user.name || "不明",
          studentId: log.user.studentId || "不明",
          sessions: [],
          currentSession: null
        };
      }

      if (log.action === "IN") {
        userGroups[uId].currentSession = {
          inTime: log.timestamp,
          outTime: null,
          durationMs: 0,
          remarks: log.remarks || null
        };
        userGroups[uId].sessions.push(userGroups[uId].currentSession);
      } else if (log.action === "OUT") {
        const session = userGroups[uId].currentSession;
        if (session && session.inTime) {
          session.outTime = log.timestamp;
          session.durationMs = new Date(log.timestamp).getTime() - new Date(session.inTime).getTime();
          session.remarks = [session.remarks, log.remarks].filter(Boolean).join(" / ");
          userGroups[uId].currentSession = null; // reset
        } else {
          // OUTから始まる異常系（前日のINのまま）は今回はスキップか前日0時からの換算にするが、
          // 簡易実装として孤立したOUTとして記録する
          userGroups[uId].sessions.push({
            inTime: null,
            outTime: log.timestamp,
            durationMs: 0,
            remarks: log.remarks || "入室記録なし"
          });
        }
      }
    });

    // フラットなリストに変換（1セッション1行）
    interface OmitSessionDataResponse {
      name: string;
      studentId: string;
      inTime: Date | null;
      outTime: Date | null;
      durationMs: number;
      remarks: string | null;
    }

    const resultList: OmitSessionDataResponse[] = [];
    Object.values(userGroups).forEach(group => {
      group.sessions.forEach((s) => {
        resultList.push({
          name: group.name,
          studentId: group.studentId,
          inTime: s.inTime,
          outTime: s.outTime,
          durationMs: s.durationMs,
          remarks: s.remarks
        });
      });
    });

    // INが早い順にソート
    resultList.sort((a, b) => {
      const aTime = a.inTime ? new Date(a.inTime).getTime() : (a.outTime ? new Date(a.outTime).getTime() : 0);
      const bTime = b.inTime ? new Date(b.inTime).getTime() : (b.outTime ? new Date(b.outTime).getTime() : 0);
      return aTime - bTime;
    });

    return NextResponse.json(resultList);
  } catch (error) {
    console.error("History fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
