import { Alert } from "@/components/ui/alert";
import type { ReconcileResult } from "./types";

export function ReconcileDone({ result }: { result: ReconcileResult }) {
  return (
    <div className="space-y-3">
      <Alert tone="success" title="Đối soát thành công">
        Đơn hàng {result.order.code} đã chuyển sang trạng thái Hoàn tất.
      </Alert>
      {result.enrollmentGranted ? (
        <p className="text-sm">Đã cấp quyền học cho học viên.</p>
      ) : (
        <Alert tone="warning" title="Chưa cấp được quyền học ngay">
          Hệ thống sẽ tự động thử lại. Kiểm tra trạng thái khóa học trong chi
          tiết đơn hàng sau ít phút.
        </Alert>
      )}
    </div>
  );
}
