import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// ▼ ここに export const authOptions を追加しました
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers:[
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    // ▼ ここから追加: ログイン時のドメインチェック
    async signIn({ user }) {
      const allowedDomain = process.env.ALLOWED_DOMAIN || "niigata-meikun.ed.jp";
      // メアドが存在し、かつ指定ドメインで終わる場合のみ true (許可)
      if (user.email && user.email.endsWith(`@${allowedDomain}`)) {
        return true;
      }
      // それ以外はアクセス拒否のエラーページへ弾く
      return "/api/auth/signin?error=AccessDenied";
    },
    // ▲ ここまで追加
    
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.studentId = user.studentId;
        session.user.isRegistered = user.isRegistered;
        session.user.currentStatus = user.currentStatus;
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
        console.log(`🎊 新規ユーザー登録完了: 学籍番号 ${studentId}`);
      }
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };