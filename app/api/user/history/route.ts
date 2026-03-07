import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// 合計滞在時間を「〇時間〇分」フォーマットにするヘルパー
function formatDuration(ms: number) {
    if (ms < 0) return "0分";
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
}

// 日付を「YYYY/MM/DD」フォーマットにするヘルパー (日本時間強制)
function formatDate(date: Date) {
    const formatter = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    // Chrome等では "2024/05/01" となるが、一部環境の対策として "-" を "/" に置換
    return formatter.format(date).replace(/-/g, '/');
}

// 時刻を「HH:MM」フォーマットにするヘルパー (日本時間強制)
function formatTime(date: Date) {
    const formatter = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit"
    });
    return formatter.format(date);
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // データベースから、このユーザーの最近の打刻ログを最大40件（約20回分の入退室）取得
        const logs = await prisma.attendanceLog.findMany({
            where: { userId: userId },
            orderBy: { timestamp: "desc" },
            take: 40,
        });

        if (logs.length === 0) {
            return NextResponse.json({ history: [] });
        }

        // ログを(IN, OUT)のペアに組み立てる
        const history = [];

        // 降順（新しい順）でループしているため、最初のレコードがOUTなら、その前のINを探す
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];

            if (log.action === "OUT") {
                // 次（古い方）のレコードがINかチェック
                if (i + 1 < logs.length && logs[i + 1].action === "IN") {
                    const inLog = logs[i + 1];
                    const durationMs = log.timestamp.getTime() - inLog.timestamp.getTime();

                    history.push({
                        id: inLog.id, // 一意のキーとしてINのIDを使用
                        date: formatDate(inLog.timestamp),
                        inTime: formatTime(inLog.timestamp),
                        outTime: formatTime(log.timestamp),
                        duration: formatDuration(durationMs)
                    });

                    // INの分も処理したのでインデックスを1つ進める
                    i++;
                } else {
                    // OUTだけがあって直前のINが見つからない（データ不整合や取得件数漏れ）
                    history.push({
                        id: log.id,
                        date: formatDate(log.timestamp),
                        inTime: "不明",
                        outTime: formatTime(log.timestamp),
                        duration: "-"
                    });
                }
            } else if (log.action === "IN") {
                // 最新のログがINのみの場合（現在滞在中、まだOUTしていない）
                history.push({
                    id: log.id,
                    date: formatDate(log.timestamp),
                    inTime: formatTime(log.timestamp),
                    outTime: "利用中",
                    duration: "-"
                });
            }
        }

        return NextResponse.json({ history });
    } catch (error) {
        console.error("Failed to fetch user history:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
