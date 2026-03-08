import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
    if (!adminEmails.includes(session.user.email)) {
        return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    try {
        const logs = await prisma.adminLog.findMany({
            orderBy: { timestamp: "desc" },
            take: 100,
        });

        return NextResponse.json(logs);
    } catch (error) {
        console.error("Audit log fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
    }
}
