import { AdminFeedback } from "@/features/admin/admin-feedback";
import type { ReactNode } from "react";
import { AdminSidebar } from "./admin/admin-sidebar";
import { AdminHeader } from "./admin/admin-header";
import { AdminMainContent } from "./admin/admin-main-content";

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminFeedback>
      <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <a
          href="#admin-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3"
        >
          Đến nội dung chính
        </a>
        <AdminSidebar />
        <div className="min-w-0">
          <AdminHeader />
          <AdminMainContent>{children}</AdminMainContent>
        </div>
      </div>
    </AdminFeedback>
  );
}
