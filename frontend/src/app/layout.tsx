import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./xueji.css";

export const metadata: Metadata = {
  title: "学籍管理系统",
  description: "学籍管理系统 — presented by TianMeng",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
