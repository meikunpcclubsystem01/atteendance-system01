import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 管理者チェック
    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
    if (!adminEmails.includes(session.user.email)) {
        return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    try {
        // 全てのAttendanceLogを（必要であれば期間指定なども可能）取得する
        // 今回は全件を一律エクスポート
        const logs = await prisma.attendanceLog.findMany({
            include: {
                user: { select: { name: true, studentId: true } },
            },
            orderBy: { timestamp: "desc" },
        });

        // CSVヘッダー
        let csvContent = "日時,生徒名,学籍番号,アクション,備考\n";

        // ログをCSV行に変換
        logs.forEach(log => {
            // 日本時間（JST）で出力
            const dateStr = new Date(log.timestamp).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
            const userName = log.user.name || "名称未設定";
            const studentId = log.user.studentId || "";
            const actionStr = log.action === "IN" ? "入室" : "退室";
            const remarks = log.remarks || "";

            // 値にカンマが含まれる場合はダブルクォーテーションで囲む簡易エスケープ
            // 脆弱性対策：CSV Injection (数式インジェクション) を防ぐため、先頭の危険な文字をエスケープ
            const escapeCsv = (str: string) => {
                let escaped = str.replace(/"/g, '""');
                if (/^[=\+\-@]/.test(escaped)) {
                    escaped = "'" + escaped;
                }
                return `"${escaped}"`;
            };

            csvContent += `${escapeCsv(dateStr)},${escapeCsv(userName)},${escapeCsv(studentId)},${actionStr},${escapeCsv(remarks)}\n`;
        });

        // BOM付きのUTF-8で出力（Excelで文字化けしないようにするため）
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);

        // CSV文字列をBufferに変換（UTF-8）
        const csvBuffer = Buffer.from(csvContent, 'utf-8');

        // BOMとCSVの中身を結合
        const finalBuffer = Buffer.concat([bom, csvBuffer]);

        // JST基準での今日の日付文字列を取得 (YYYY-MM-DD)
        const nowJST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        const yyyyMmDd = `${nowJST.getFullYear()}-${String(nowJST.getMonth() + 1).padStart(2, '0')}-${String(nowJST.getDate()).padStart(2, '0')}`;

        // BlobやBufferを使わずともNode.js Responseでは文字として送れる
        // より確実にするためのHeaders設定
        return new NextResponse(finalBuffer, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="attendance_logs_${yyyyMmDd}.csv"`,
            },
        });

    } catch (error) {
        console.error("Export error:", error);
        return NextResponse.json({ error: "Failed to export logs" }, { status: 500 });
    }
}
