import { FileWarning, RefreshCw, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MediaErrorFallback({ kind, onRetry }: {
  kind: "video" | "document";
  onRetry?: () => void;
}) {
  const video = kind === "video";
  return (
    <div data-testid={`media-error-${kind}`} role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-surface p-6 text-center">
      {video ? <VideoOff aria-hidden size={36} /> : <FileWarning aria-hidden size={36} />}
      <div className="space-y-1">
        <h3 className="font-semibold">{video ? "Không thể tải video bài học này" : "Tài liệu bài học không tồn tại hoặc đã bị xóa"}</h3>
        <p className="text-sm text-muted">
          {video
            ? "Vui lòng kiểm tra lại kết nối hoặc thử lại sau."
            : "Vui lòng liên hệ hỗ trợ nếu bạn cho rằng đây là lỗi."}
        </p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden size={17} /> Thử lại
        </Button>
      ) : (
        <a className="text-sm text-primary underline" href="mailto:support@shanity.local">Liên hệ hỗ trợ</a>
      )}
    </div>
  );
}
