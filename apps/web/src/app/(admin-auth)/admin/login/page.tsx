import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-session";
import { safeAdminRedirect } from "@/lib/auth-redirect";
import { Spinner } from "@/components/ui/spinner";
import { AdminLoginForm } from "@/features/admin/auth/admin-login-form";

export const metadata = {
  title: "Admin Login · Shanity",
  robots: { index: false, follow: false },
};
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const destination = safeAdminRedirect(
    typeof params.redirect === "string" ? params.redirect : null,
  );
  const user = await getServerUser();
  if (user?.roles.includes("admin")) redirect(destination);
  return (
    <Suspense fallback={<Spinner label="Đang tải đăng nhập quản trị" />}>
      <AdminLoginForm destination={destination} />
    </Suspense>
  );
}
