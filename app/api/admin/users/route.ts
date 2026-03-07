import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { studentId: "asc" }
    });
    return NextResponse.json(users);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
