import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Next.js 16 Proxy Middleware
 * 旧 middleware.ts からの移行。
 * 命名規約として関数名を proxy に変更し、named export する必要があります。
 */
export const proxy = withAuth(
  function proxy(_req) {
    // 認証済みのユーザー情報（token）はコールバック内で検証されるため
    // ここは基本的に通過させるだけでOKです
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        const isAdminRoute =
          path.startsWith("/admin") ||
          path.startsWith("/scanner") ||
          path.startsWith("/api/admin");

        // アクセス先が管理者用URLの場合
        if (isAdminRoute) {
          // .env に設定した管理者リストを取得
          const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];

          // ログインしており、かつメールアドレスが管理者リストに含まれているか判定
          if (token?.email && adminEmails.includes(token.email)) {
            return true; // アクセス許可
          }
          return false; // アクセス拒否 (ログイン画面に強制リダイレクト)
        }

        // 管理者用以外の一般ルート（生徒のダッシュボード等）は、
        // ページごとのチェックに任せるため一旦通過させる
        return true;
      },
    },
  }
);

// Middlewareを監視・発動させるURLのパターンを指定
export const config = {
  matcher: [
    "/admin/:path*",
    "/scanner/:path*",
    "/api/admin/:path*",
  ],
};
