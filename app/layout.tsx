import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import AuthGuard from "./_components/AuthGuard";
import ClientTopBar from "./_components/ClientTopBar";
import ScrollToTopOnRoute from "./_components/ScrollToTopOnRoute";
import ClientFooter from "./_components/ClientFooter";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-noto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "마트방송 (Mart Radio)",
  description: "동네 마트 행사/타임세일 방송 멘트 생성 · MP3 저장 · 재생",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={notoSansKr.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <AuthGuard>
          <ClientTopBar />
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <ScrollToTopOnRoute />
            {children}
          </div>
          <ClientFooter />
        </AuthGuard>
      </body>
    </html>
  );
}
