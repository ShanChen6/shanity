import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";

export default function UserNotFound() {
  return (
    <EmptyState
      title="Không tìm thấy người dùng"
      description="Liên kết người dùng không hợp lệ."
      action={
        <Link href="/admin/users" className="text-primary hover:underline">
          Quay lại danh sách
        </Link>
      }
    />
  );
}
