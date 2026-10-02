import { Badge } from "@/components/ui/badge";
export const roleLabels: Record<string, string> = {
  student: "Học sinh",
  instructor: "Giảng viên",
  admin: "Quản trị viên",
};
export function RoleBadges({ roles }: { roles: string[] }) {
  if (!roles.length) return <span className="text-muted">Chưa có vai trò</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <Badge key={role} tone="secondary">
          {roleLabels[role] ?? role}
        </Badge>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={status === "active" ? "success" : "warning"}>
      {status === "active" ? "Hoạt động" : "Đã khóa"}
    </Badge>
  );
}
