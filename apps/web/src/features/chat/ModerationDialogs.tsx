"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/providers/toast-provider";
import { ApiError, errorMessage } from "@/lib/api";
import { hideChatMessage, muteChatUser, reportChatMessage } from "./api";
import type { ChatMessage } from "./types";

const REASON_MAX = 1000;

export const REPORT_REASONS = [
  "Spam hoặc quảng cáo",
  "Ngôn từ xúc phạm, thù ghét",
  "Quấy rối hoặc bắt nạt",
  "Nội dung không phù hợp với khóa học",
  "Khác",
] as const;

export const MUTE_DURATIONS = [
  { minutes: 15, label: "15 phút" },
  { minutes: 60, label: "1 giờ" },
  { minutes: 24 * 60, label: "1 ngày" },
  { minutes: 7 * 24 * 60, label: "7 ngày" },
] as const;

/** The chosen reason, plus the details when given. */
export function reportReason(choice: string, details: string) {
  const extra = details.trim();
  return (extra ? `${choice}: ${extra}` : choice).slice(0, REASON_MAX);
}

function Excerpt({ message }: { message: ChatMessage }) {
  return (
    <blockquote className="mb-4 rounded-md border-l-4 border-border-strong bg-surface-secondary px-3 py-2 text-sm">
      <p className="font-semibold">{message.sender.name}</p>
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-foreground-secondary">
        {message.content}
      </p>
    </blockquote>
  );
}

/** Shared submit plumbing: busy state, toast on success, inline error. */
function useAction(onDone: () => void) {
  const toasts = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(
    action: () => Promise<unknown>,
    success: string,
    explain: (error: ApiError) => string | null = () => null,
  ) {
    setBusy(true);
    setError("");
    try {
      await action();
      toasts.success(success);
      onDone();
    } catch (cause) {
      setError(
        (cause instanceof ApiError && explain(cause)) || errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function Actions({
  busy,
  error,
  submit,
  onClose,
  tone = "primary",
}: {
  busy: boolean;
  error: string;
  submit: string;
  onClose: () => void;
  tone?: "primary" | "danger";
}) {
  return (
    <>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger-foreground">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Hủy
        </Button>
        <Button type="submit" variant={tone} loading={busy}>
          {submit}
        </Button>
      </div>
    </>
  );
}

/** A learner flags a message for the course's moderators. */
export function ReportMessageDialog({
  message,
  onClose,
}: {
  message: ChatMessage;
  onClose: () => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const { busy, error, run } = useAction(onClose);
  const needsDetails = choice === "Khác" && !details.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (needsDetails) return;
    void run(
      () => reportChatMessage(message.id, reportReason(choice, details)),
      "Đã gửi báo cáo. Cảm ơn bạn đã giúp giữ lớp học an toàn.",
      (cause) =>
        cause.code === "CHAT_ALREADY_REPORTED"
          ? "Bạn đã báo cáo tin nhắn này rồi."
          : cause.code === "CHAT_MESSAGE_NOT_FOUND"
            ? "Tin nhắn này không còn tồn tại."
            : null,
    );
  }

  return (
    <Dialog
      title="Báo cáo tin nhắn"
      description="Giảng viên của khóa học sẽ xem xét báo cáo. Người gửi không biết ai đã báo cáo."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <Excerpt message={message} />
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Lý do</legend>
          {REPORT_REASONS.map((reason, index) => (
            <label
              key={reason}
              className="flex items-center gap-3 text-sm"
              htmlFor={`${id}-${index}`}
            >
              <Radio
                id={`${id}-${index}`}
                name="reason"
                value={reason}
                checked={choice === reason}
                onChange={() => setChoice(reason)}
              />
              {reason}
            </label>
          ))}
        </fieldset>
        <Label htmlFor={`${id}-details`} className="mt-4">
          Chi tiết {choice === "Khác" ? "(bắt buộc)" : "(không bắt buộc)"}
        </Label>
        <Textarea
          id={`${id}-details`}
          className="mt-1 min-h-20"
          maxLength={500}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          aria-invalid={needsDetails || undefined}
        />
        <Actions
          busy={busy}
          error={error}
          submit="Gửi báo cáo"
          onClose={onClose}
        />
      </form>
    </Dialog>
  );
}

/** A moderator hides a message for learners. */
export function HideMessageDialog({
  message,
  onClose,
  onHidden,
}: {
  message: ChatMessage;
  onClose: () => void;
  onHidden?: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction(() => {
    onHidden?.();
    onClose();
  });
  return (
    <Dialog
      title="Ẩn tin nhắn"
      description="Học viên sẽ không còn thấy nội dung này. Mọi báo cáo đang chờ về tin nhắn được đánh dấu đã xử lý."
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () => hideChatMessage(message.id, reason.trim() || undefined),
            "Đã ẩn tin nhắn.",
          );
        }}
      >
        <Excerpt message={message} />
        <Label htmlFor={`${id}-reason`}>Ghi chú (không bắt buộc)</Label>
        <Textarea
          id={`${id}-reason`}
          className="mt-1 min-h-20"
          maxLength={REASON_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Actions
          busy={busy}
          error={error}
          submit="Ẩn tin nhắn"
          onClose={onClose}
          tone="danger"
        />
      </form>
    </Dialog>
  );
}

/** A moderator suspends a learner's sending in one course. */
export function MuteUserDialog({
  courseId,
  user,
  onClose,
}: {
  courseId: string;
  user: { id: string; name: string };
  onClose: () => void;
}) {
  const id = useId();
  const [minutes, setMinutes] = useState<number>(MUTE_DURATIONS[1].minutes);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction(onClose);
  return (
    <Dialog
      title={`Tạm khóa gửi tin: ${user.name}`}
      description="Người này vẫn đọc được phòng chat nhưng không gửi được tin nhắn cho đến khi hết hạn."
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () => muteChatUser(user.id, courseId, minutes, reason.trim() || undefined),
            `Đã tạm khóa ${user.name}.`,
            (cause) =>
              cause.code === "CHAT_MUTE_TARGET_FORBIDDEN"
                ? "Không thể tạm khóa giảng viên của khóa học hoặc chính bạn."
                : null,
          );
        }}
      >
        <Label htmlFor={`${id}-duration`}>Thời hạn</Label>
        <Select
          id={`${id}-duration`}
          className="mt-1"
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
        >
          {MUTE_DURATIONS.map((option) => (
            <option key={option.minutes} value={option.minutes}>
              {option.label}
            </option>
          ))}
        </Select>
        <Label htmlFor={`${id}-reason`} className="mt-4">
          Lý do (không bắt buộc)
        </Label>
        <Textarea
          id={`${id}-reason`}
          className="mt-1 min-h-20"
          maxLength={REASON_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Actions
          busy={busy}
          error={error}
          submit="Tạm khóa"
          onClose={onClose}
          tone="danger"
        />
      </form>
    </Dialog>
  );
}
