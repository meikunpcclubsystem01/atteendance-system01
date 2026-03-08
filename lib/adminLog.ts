import { prisma } from "@/lib/prisma";

export async function recordAdminLog(
    adminEmail: string,
    action: string,
    details?: string
) {
    try {
        await prisma.adminLog.create({
            data: { adminEmail, action, details },
        });
    } catch (error) {
        // ログ記録の失敗は本体処理に影響させない
        console.error("Failed to record admin log:", error);
    }
}
