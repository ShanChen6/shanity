import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AdminSettings } from "@/features/admin/settings";
import { requireRole } from "@/lib/server-session";

export const metadata: Metadata = { title: "Cài đặt hệ thống · Quản trị" };

export default async function AdminSettingsPage() {
  // The admin layout also admits finance officers; settings are admin-only.
  await requireRole("admin");
  return (
    <>
      <PageHeader
        title="Cài đặt hệ thống"
        description="Trạng thái dịch vụ và cấu hình thanh toán đang áp dụng."
      />
      <div className="mt-6">
        <AdminSettings />
      </div>
    </>
  );
}
