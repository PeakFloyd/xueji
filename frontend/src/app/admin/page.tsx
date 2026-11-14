import type { Metadata } from "next";
import AdminClient from "@/components/admin/AdminClient";
import { uiSans } from "@/components/xueji/font";

export const metadata: Metadata = {
  title: "后台 · 库表结构 — 学籍管理系统",
  description: "学籍管理系统后台：已建成的表、视图、约束、数据与数据库文件逐页结构（仅管理员）",
};

export default function AdminPage() {
  return (
    <main className={uiSans.variable}>
      <AdminClient uiFont={uiSans.style.fontFamily} />
    </main>
  );
}
