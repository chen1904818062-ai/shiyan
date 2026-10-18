import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "拾言 · 让每次对话，都有所留",
  description: "汇集 AI 对话，按话题整理成几分钟就能读完的回顾。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
