import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { CredentialsForm } from "@/features/auth/credentials-form";
export const metadata: Metadata = {
  title: "Đăng ký · Shanity",
  robots: { index: false },
};
export default function RegisterPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<Spinner label="Đang tải đăng ký" />}>
        <CredentialsForm register />
      </Suspense>
    </AuthLayout>
  );
}
