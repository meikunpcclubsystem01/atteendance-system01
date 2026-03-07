import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// ▼ ここに export const authOptions を追加しました
import { Adapter } from "next-auth/adapters";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    // Middleware(withAuth)はJWTでないと動作しないため、PrismaAdapter使用時も強制的にJWTを使用する
    strategy: "jwt"
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    // ▼ ここから追加: ログイン時のドメインチェック
    async signIn({ user }) {
      const allowedDomain = process.env.ALLOWED_DOMAIN || "niigata-meikun.ed.jp";
      const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];

      // 1. 管理者として登録されているメールアドレスは、ドメイン問わず無条件でログイン許可
      if (user.email && adminEmails.includes(user.email)) {
        return true;
      }

      // 2. 一般生徒の場合は、指定ドメイン（学校のドメイン）で終わる場合のみ許可
      if (user.email && user.email.endsWith(`@${allowedDomain}`)) {
        return true;
      }

      // それ以外（個人のGmailなど）はアクセス拒否のエラーページへ弾く
      return "/api/auth/signin?error=AccessDenied";
    },
    // ▲ ここまで追加

    async session({ session, token }) {
      if (session.user && token?.sub) {
        // JWTストラテジーを使用しているため、セッションコールバックに user オブジェクトが含まれない。
        // 代わりに token.sub (ユーザーID) を使って、毎回DBから最新の状態を取得する。
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
        });

        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.studentId = dbUser.studentId;
          session.user.isRegistered = dbUser.isRegistered;
          session.user.currentStatus = dbUser.currentStatus;
          session.user.validFrom = dbUser.validFrom;
          session.user.validUntil = dbUser.validUntil;

          // 管理者判定
          const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
          session.user.isAdmin = !!(dbUser.email && adminEmails.includes(dbUser.email));
        }
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.email) {
        const studentId = user.email.split("@")[0];
        await prisma.user.update({
          where: { id: user.id },
          data: { studentId: studentId },
        });
      }
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };