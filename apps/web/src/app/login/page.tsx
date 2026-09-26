import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { CredentialsForm } from "@/features/auth/credentials-form";
export const metadata: Metadata = {
  title: "Đăng nhập · Shanity",
  robots: { index: false },
};
export default function LoginPage() {
  return (
    <AuthLayout>
      <CredentialsForm />
    </AuthLayout>
  );
}
