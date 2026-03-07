import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(_req) {
    // 認証済みのユーザー情報（token）はコールバック内で検証されるため
    // ここは基本的に通過させるだけでOKです
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // 管理者権限が必要なURLリスト
        const isAdminRoute =
          path.startsWith("/admin") ||
          path.startsWith("/scanner") ||
          path.startsWith("/api/admin") ||
          path.startsWith("/api/checkin") ||
          path.startsWith("/api/seats");

        // アクセス先が管理者用URLの場合
        if (isAdminRoute) {
          // .env に設定した管理者リストを取得
          const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];

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
    "/api/checkin/:path*",
    "/api/seats/:path*"
  ],
};