import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export function getAdminEmails(): string[] {
  return process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim()).filter(Boolean) || [];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && getAdminEmails().includes(email);
}

// 管理者としてログイン済みのセッションを返す。未ログイン・非管理者はnull。
export async function getAdminSession(): Promise<Session | null> {
  const session = await getServerSession(authOptions);
  if (!isAdminEmail(session?.user?.email)) return null;
  return session;
}
