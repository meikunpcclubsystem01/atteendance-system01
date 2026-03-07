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
    const users = await prisma.user.findMany({
      orderBy: { studentId: "asc" }
    });
    return NextResponse.json(users);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
