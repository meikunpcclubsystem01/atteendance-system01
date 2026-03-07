import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers"; // 作ったファイルを読み込み

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "入退室システム",
  description: "新潟明訓100周年記念会館 自習室入退室管理",
  manifest: "/manifest.json",
  themeColor: "#111827",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "自習室",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}