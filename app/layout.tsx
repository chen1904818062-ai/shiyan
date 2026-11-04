import type { Metadata } from "next";
import "./globals.css";
import "./memory.css";

export const metadata: Metadata = {
  title: "拾言 · 个人 AI 记忆系统",
  description: "将对话和经历沉淀为可追溯、可更新、可调用的个人记忆。",
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
