import { Suspense } from "react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Spinner } from "@/components/ui/spinner";
import { OAuthCallback } from "@/features/auth/oauth-callback";
export const metadata = {
  title: "Kết nối Google · Shanity",
  robots: { index: false },
};
export default function CallbackPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<Spinner label="Đang kiểm tra kết quả Google" />}>
        <OAuthCallback />
      </Suspense>
    </AuthLayout>
  );
}
