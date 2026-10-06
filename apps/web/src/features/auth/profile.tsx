"use client";

import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { CurrentUserAvatar } from "./current-user-avatar";
import { AvatarManager } from "./avatar-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EditProfile } from "./edit-profile";
import { ChangePassword } from "./change-password";
import { UserHeader } from "./user-header";
import { useSession } from "./session-provider";

const roles = {
  student: "Học sinh",
  instructor: "Giảng viên",
  admin: "Quản trị viên",
};

export function Profile() {
  const session = useSession();
  if (session.status === "loading" || session.status === "anonymous")
    return <Spinner label="Đang tải hồ sơ" />;
  if (session.status === "error" || !session.user)
    return (
      <PageContainer className="py-16">
        <Alert tone="error">
          {session.error || "Không thể tải thông tin hồ sơ."}
        </Alert>
        <Button className="mt-4" onClick={() => void session.load()}>
          Thử lại
        </Button>
      </PageContainer>
    );
  const user = session.user;
  return (
    <PageContainer className="max-w-5xl py-6 sm:py-10">
      <UserHeader />
      <main className="mt-10 space-y-6">
        <div>
          <h1 className="text-title font-semibold">Hồ sơ của bạn</h1>
          <p className="mt-2 text-muted">
            Thông tin tài khoản của bạn trên Shanity.
          </p>
        </div>
        {session.message && <Alert tone="success">{session.message}</Alert>}
        <Card>
          <h2 className="text-lg font-semibold">Học tập</h2>
          <p className="mt-1 text-muted">
            Chọn một khóa học, sau đó bấm “Vào học” để mở bài học.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/courses"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Xem khóa học
            </Link>
            <Link
              href="/my-courses"
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-hover"
            >
              Khóa học của tôi
            </Link>
          </div>
        </Card>
        <Card>
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <CurrentUserAvatar className="size-20 text-2xl" />
            <div className="min-w-0 space-y-2">
              <h2 className="break-words text-2xl font-semibold">
                {user.displayName}
              </h2>
              <p className="break-all text-muted">{user.email}</p>
              <div className="flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <Badge key={role} tone="primary">
                    {roles[role] ?? role}
                  </Badge>
                ))}
                {!user.roles.length && <Badge>Chưa được phân vai trò</Badge>}
              </div>
            </div>
          </div>
        </Card>
        <div className="grid min-w-0 gap-6 md:grid-cols-2">
          <Card>
            <h2 className="mb-5 text-lg font-semibold">Thông tin cá nhân</h2>
            <dl className="space-y-5">
              <div>
                <dt className="text-sm text-muted">Tên hiển thị</dt>
                <dd className="break-words font-medium">{user.displayName}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Email</dt>
                <dd className="break-all font-medium">{user.email}</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-5 text-lg font-semibold">Thông tin tài khoản</h2>
            <dl>
              <dt className="text-sm text-muted">Vai trò tài khoản</dt>
              <dd className="mt-1 font-medium">
                {user.roles.map((role) => roles[role] ?? role).join(", ") ||
                  "Chưa được phân vai trò"}
              </dd>
            </dl>
          </Card>
        </div>
        <Card>
          <h2 className="text-lg font-semibold">Tùy chọn hồ sơ</h2>
          <p id="profile-actions-note" className="mt-2 text-sm text-muted">
            Bạn có thể chỉnh sửa tên hiển thị, ảnh đại diện và đổi mật khẩu.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <EditProfile key={user.id} />
            <AvatarManager key={`avatar-${user.id}`} />
            <ChangePassword key={`password-${user.id}`} />
          </div>
        </Card>
      </main>
    </PageContainer>
  );
}
