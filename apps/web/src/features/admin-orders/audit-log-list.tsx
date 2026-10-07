import { Badge } from "@/components/ui/badge";
import { formatTimestamp } from "./format";
import { DetailSection } from "./detail-sections";
import { JsonPre } from "./json-block";
import { ProofLink } from "./proof-link";
import { AUDIT_ACTION_LABELS } from "./order-model";
import type { AuditLog } from "./types";

function StateDiff({ log }: { log: AuditLog }) {
  if (!log.previousState && !log.newState) return null;
  return (
    <details className="mt-2">
      <summary className="min-h-9 cursor-pointer select-none py-2 text-xs font-semibold text-primary">
        Xem trạng thái trước / sau
      </summary>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold text-muted">Trước</p>
          <JsonPre value={log.previousState} label="Trạng thái trước" />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold text-muted">Sau</p>
          <JsonPre value={log.newState} label="Trạng thái sau" />
        </div>
      </div>
    </details>
  );
}

function AuditEntry({ log }: { log: AuditLog }) {
  const actor = log.actorType === "SYSTEM" ? "SYSTEM" : log.actorEmail;
  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={log.action === "DETAIL_VIEWED" ? "neutral" : "secondary"}>
          {AUDIT_ACTION_LABELS[log.action]}
        </Badge>
        <time dateTime={log.createdAt} className="text-xs text-muted">
          {formatTimestamp(log.createdAt)}
        </time>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Người thực hiện</dt>
        <dd className="break-all font-medium">{actor}</dd>
        <dt className="text-muted">Địa chỉ IP</dt>
        <dd className="break-all font-mono">{log.ipAddress ?? "—"}</dd>
      </dl>
      <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
        <span className="text-xs font-semibold text-muted">Lý do: </span>
        {log.reason}
      </p>
      {log.action === "MANUAL_RECONCILED" && (
        <ProofLink url={log.newState?.proofImageUrl} />
      )}
      <StateDiff log={log} />
    </li>
  );
}

export function AuditLogList({ logs }: { logs: AuditLog[] }) {
  return (
    <DetailSection id="order-audit" title="Nhật ký kiểm toán">
      <p className="mb-3 text-sm text-muted">
        Nhật ký chỉ ghi thêm, không thể sửa hoặc xóa.
      </p>
      {logs.length === 0 ? (
        <p className="text-sm text-muted">Chưa có bản ghi nào.</p>
      ) : (
        <ol className="space-y-3">
          {logs.map((log) => (
            <AuditEntry key={log.id} log={log} />
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
