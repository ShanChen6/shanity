"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, FileText, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "@/components/ui/toast";
import { Failure } from "@/features/instructor/shared";
import { KatexText } from "@/features/quiz-player/KatexText";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useGradeHistory,
  useGradingAttempt,
  usePublishAttempt,
  useSaveGrades,
} from "./api";
import {
  adjustedQuestions,
  awardedOf,
  essaysOf,
  gradeIssue,
  gradesPayload,
  initialInputs,
  type EssayAttachment,
  type EssayQuestionView,
  type GradeInput,
  type GradeResult,
  type GradingAttempt,
} from "./model";

/** The server's own message when it refuses a grade (e.g. above the maximum). */
const saveError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 400) {
    const message = error.data.message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(" ");
  }
  if (error instanceof ApiError && error.status === 409)
    return "Bài này không còn ở trạng thái chờ chấm.";
  return errorMessage(error);
};

function Attachments({ files }: { files: EssayAttachment[] }) {
  const [zoomed, setZoomed] = useState<EssayAttachment | null>(null);
  return (
    <>
      <ul className="mt-3 flex flex-wrap gap-3">
        {files.map((file) => (
          <li key={file.url}>
            {file.mimeType.startsWith("image/") ? (
              <button
                type="button"
                onClick={() => setZoomed(file)}
                aria-label={`Phóng to ${file.filename}`}
                className="block overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-primary"
              >
                {/* Remote user images: a plain img, no optimizer proxy. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.url}
                  alt={file.filename}
                  className="h-24 w-32 object-cover"
                />
              </button>
            ) : (
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm underline"
              >
                <FileText aria-hidden size={15} /> {file.filename}
              </a>
            )}
          </li>
        ))}
      </ul>
      {zoomed ? (
        <Dialog
          title={zoomed.filename}
          onClose={() => setZoomed(null)}
          className="max-w-5xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomed.url}
            alt={zoomed.filename}
            className="max-h-[75dvh] w-full object-contain"
          />
        </Dialog>
      ) : null}
    </>
  );
}

function EssayCard({
  index,
  question,
  input,
  disabled,
  onChange,
  onHistory,
}: {
  index: number;
  question: EssayQuestionView;
  input: GradeInput;
  disabled: boolean;
  onChange: (input: GradeInput) => void;
  onHistory: () => void;
}) {
  const rubric = question.rubric?.length ? question.rubric : null;
  const issue = gradeIssue(question, input);
  const awarded = awardedOf(question, input);
  const graded = question.grading?.status === "GRADED";
  const text = question.essayAnswer?.text?.trim();
  const files = question.essayAnswer?.attachments ?? [];
  // Below lg the two columns become tabs: the answer, or the grading form.
  const [pane, setPane] = useState<"answer" | "grade">("answer");
  const max = question.points.toFixed(1);
  return (
    <article
      aria-label={`Câu tự luận ${index + 1}`}
      className="grid gap-5 rounded-lg border border-border bg-surface p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div
        role="tablist"
        aria-label={`Câu ${index + 1}`}
        className="flex gap-2 lg:hidden"
      >
        {(
          [
            ["answer", "Bài làm"],
            ["grade", "Chấm điểm"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={pane === value}
            onClick={() => setPane(value)}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-semibold",
              pane === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong hover:bg-surface-hover",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={cn(
          "min-w-0 space-y-4",
          pane !== "answer" && "max-lg:hidden",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            Câu {index + 1} · tối đa {question.points} điểm
          </span>
          <Badge tone={graded ? "success" : "warning"}>
            {graded ? "Đã chấm" : "Chưa chấm"}
          </Badge>
          {graded ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={onHistory}
              aria-label={`Xem lịch sử sửa điểm câu ${index + 1}`}
            >
              <History aria-hidden size={14} className="mr-1" /> Xem Lịch sử Sửa
              điểm
            </Button>
          ) : null}
        </div>
        <div>
          <h2 className="text-sm font-semibold">Đề bài</h2>
          <div className="mt-1">
            <KatexText text={question.content} />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Bài làm của học viên</h3>
          <div className="mt-1 rounded-md border border-border bg-surface-secondary p-3">
            {text ? (
              <KatexText text={text} />
            ) : (
              <p className="text-sm text-muted">Không có nội dung văn bản.</p>
            )}
            {files.length ? <Attachments files={files} /> : null}
          </div>
        </div>
        <div className="rounded-md border border-dashed border-border p-3">
          <h3 className="text-sm font-semibold">Hướng dẫn chấm</h3>
          {question.gradingGuide ? (
            <p className="mt-1 whitespace-pre-line text-sm">
              {question.gradingGuide}
            </p>
          ) : null}
          {rubric ? (
            <ul className="mt-2 space-y-1 text-sm">
              {rubric.map((criterion) => (
                <li key={criterion.criterion} className="flex gap-2">
                  <span className="min-w-0 flex-1">
                    {criterion.criterion}
                    {criterion.description ? (
                      <span className="text-muted">
                        {" "}
                        — {criterion.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">{criterion.maxPoints} đ</span>
                </li>
              ))}
            </ul>
          ) : null}
          {!question.gradingGuide && !rubric ? (
            <p className="mt-1 text-sm text-muted">Chưa có hướng dẫn chấm.</p>
          ) : null}
        </div>
      </div>

      <fieldset
        disabled={disabled}
        className={cn(
          "space-y-3 rounded-md border border-border-strong p-3 lg:self-start",
          pane !== "grade" && "max-lg:hidden",
        )}
      >
        <legend className="px-1 text-sm font-semibold">Chấm điểm</legend>
        {rubric ? (
          <div className="space-y-2">
            {rubric.map((criterion, criterionIndex) => (
              <label
                key={criterion.criterion}
                className="flex items-center gap-2 text-sm"
              >
                <span className="min-w-0 flex-1">{criterion.criterion}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={criterion.maxPoints}
                  step="any"
                  aria-label={`${criterion.criterion} (câu ${index + 1})`}
                  className="!w-20 py-1.5 text-sm"
                  value={input.rubric[criterionIndex] ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...input,
                      rubric: input.rubric.map((value, at) =>
                        at === criterionIndex ? event.target.value : value,
                      ),
                    })
                  }
                />
                <span className="text-xs text-muted">
                  / {criterion.maxPoints}
                </span>
              </label>
            ))}
            <p className="text-sm font-medium tabular-nums">
              Tổng: {awarded ?? "—"} / {max}
            </p>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm font-medium">
            Score:
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={question.points}
              step={1}
              aria-label={`Điểm câu ${index + 1}`}
              aria-invalid={issue ? true : undefined}
              className="!w-20 py-1.5 text-sm"
              value={input.points}
              onChange={(event) =>
                onChange({ ...input, points: event.target.value })
              }
            />
            <span className="tabular-nums">/ {max}</span>
          </label>
        )}
        {issue ? (
          <p role="alert" className="text-xs text-danger-foreground">
            {issue}
          </p>
        ) : null}
        <label className="block text-sm font-medium">
          Feedback
          <Textarea
            value={input.feedback}
            maxLength={10_000}
            placeholder="Nhận xét bài làm (tùy chọn)"
            className="mt-1 !min-h-24 text-sm"
            onChange={(event) =>
              onChange({ ...input, feedback: event.target.value })
            }
          />
        </label>
      </fieldset>
    </article>
  );
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

/** Every adjustment of one attempt's essay grades, oldest first. */
function HistoryDialog({
  attemptId,
  questionId,
  onClose,
}: {
  attemptId: string;
  questionId: string;
  onClose: () => void;
}) {
  const history = useGradeHistory(attemptId, true);
  const question = history.data?.questions.find(
    (item) => item.questionId === questionId,
  );
  return (
    <Dialog
      title={
        question ? `Lịch sử sửa điểm · Câu ${question.number}` : "Lịch sử sửa điểm"
      }
      description="Mọi lần thay đổi điểm được ghi lại và không thể xóa."
      onClose={onClose}
    >
      {history.error ? (
        <Failure error={history.error} retry={() => void history.refetch()} />
      ) : history.isPending ? (
        <p className="text-sm text-muted">Đang tải…</p>
      ) : !question?.adjustments.length ? (
        <p className="text-sm text-muted" data-testid="no-adjustments">
          Chưa có lần điều chỉnh nào. Điểm hiện tại: {question?.currentScore ?? "—"}
          {question ? ` / ${question.maxScore}` : ""}.
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Score History Timeline">
          {question.adjustments.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-border p-3 text-sm"
            >
              <p className="font-semibold tabular-nums">
                {item.oldScore} → {item.newScore} / {question.maxScore}
                {item.wasPublished ? (
                  <Badge tone="warning" className="ml-2">
                    Sau công bố
                  </Badge>
                ) : null}
              </p>
              <p className="text-xs text-muted">
                {item.adjustedBy.fullName} · {when(item.adjustedAt)}
              </p>
              {item.adjustmentReason ? (
                <p className="mt-1">
                  <strong>Lý do:</strong> {item.adjustmentReason}
                </p>
              ) : null}
              {(item.oldFeedback ?? "") !== (item.newFeedback ?? "") ? (
                <p className="mt-1 text-muted">
                  Nhận xét: “{item.oldFeedback ?? "—"}” → “
                  {item.newFeedback ?? "—"}”
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/**
 * Asks why already-given grades change. Once the result is published the
 * reason is mandatory (the server insists too); every adjustment is logged.
 */
function ReasonDialog({
  count,
  required,
  busy,
  onConfirm,
  onClose,
}: {
  count: number;
  required: boolean;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const missing = required && !reason.trim();
  return (
    <Dialog
      title="Lý do điều chỉnh điểm"
      description={`Bạn đang sửa ${count} câu đã chấm${
        required ? " sau khi đã công bố cho học viên" : ""
      }. Thay đổi được ghi lại vĩnh viễn trong lịch sử sửa điểm.`}
      busy={busy}
      onClose={onClose}
    >
      <label className="block text-sm font-medium">
        Adjustment Reason{required ? " *" : " (tùy chọn)"}
        <Textarea
          value={reason}
          maxLength={2000}
          aria-required={required}
          aria-invalid={missing ? true : undefined}
          placeholder="Ví dụ: Phúc khảo — bổ sung ý đúng ở trang 2."
          className="mt-1 !min-h-24 text-sm"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {missing ? (
        <p role="alert" className="mt-1 text-xs text-danger-foreground">
          Vui lòng nhập lý do điều chỉnh điểm.
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Hủy
        </Button>
        <Button
          loading={busy}
          loadingLabel="Đang lưu…"
          disabled={missing}
          onClick={() => onConfirm(reason)}
        >
          Xác nhận điều chỉnh
        </Button>
      </div>
    </Dialog>
  );
}

/** The workspace's shape while the attempt loads: no spinner, no layout jump. */
export function WorkspaceSkeleton() {
  return (
    <div
      className="space-y-5"
      role="status"
      aria-busy="true"
      aria-label="Đang tải bài làm"
      data-testid="workspace-skeleton"
    >
      <Skeleton className="h-4 w-40" />
      <div className="space-y-2 rounded-lg border border-border bg-surface p-5">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-5 rounded-lg border border-border bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

function Workspace({ attempt }: { attempt: GradingAttempt }) {
  const [inputs, setInputs] = useState(() => initialInputs(attempt));
  const [toast, setToast] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(null);
  const [final, setFinal] = useState<GradeResult | null>(null);
  const [askingReason, setAskingReason] = useState(false);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const save = useSaveGrades(attempt.attemptId);
  const publish = usePublishAttempt();
  const essays = essaysOf(attempt);
  const open = attempt.status === "NEEDS_GRADING";
  const published = attempt.status === "COMPLETED";
  const payload = gradesPayload(attempt, inputs);
  // Changing a grade that was already given is an audited adjustment.
  const adjusting = adjustedQuestions(attempt, inputs);
  const invalid = essays.some((question) => {
    const input = inputs[question.id];
    return input ? gradeIssue(question, input) !== null : false;
  });

  function submit(reason = "") {
    save.mutate(
      {
        grades: payload,
        ...(reason.trim() && { adjustmentReason: reason.trim() }),
      },
      {
      onSuccess: (result) => {
        setFinal(result);
        setAskingReason(false);
        setToast({
          tone: "info",
          message: result.adjustedQuestionIds.length
            ? `Đã lưu điều chỉnh điểm (${result.adjustedQuestionIds.length} câu). Lịch sử sửa điểm đã được ghi lại.`
            : result.result
            ? `Đã lưu điểm. Bài đã chấm xong: ${result.result.earnedPoints}/${result.result.totalPoints} điểm (${result.result.percentage}%).`
            : `Đã lưu điểm. Còn ${result.remainingUngradedCount} câu chưa chấm.`,
        });
      },
      onError: (error) => {
        setAskingReason(false);
        setToast({ tone: "error", message: saveError(error) });
      },
      },
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href="/instructor/grading"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft aria-hidden size={14} /> Hàng chờ chấm bài
      </Link>

      <header
        className="rounded-lg border border-border bg-surface p-4 sm:p-5"
        data-testid="grading-header"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{attempt.student.fullName}</h1>
          <Badge
            tone={
              open
                ? "warning"
                : attempt.status === "GRADED"
                  ? "neutral"
                  : "success"
            }
          >
            {open
              ? `${attempt.pendingEssaysCount} essays pending`
              : attempt.status === "GRADED"
                ? "GRADED (Unpublished)"
                : "PUBLISHED"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{attempt.student.email}</p>
        <p className="mt-2 text-sm">
          <strong>{attempt.quiz.title}</strong> ·{" "}
          {attempt.course?.title ?? "Quiz độc lập"}
        </p>
      </header>

      {final?.result ? (
        <p
          role="status"
          className="rounded-md border border-success/40 bg-success-background p-3 text-sm text-success-foreground"
        >
          Bài đã chấm xong: {final.result.earnedPoints}/
          {final.result.totalPoints} điểm ({final.result.percentage}%) —{" "}
          {final.result.isPassed ? "Đạt" : "Chưa đạt"}. Học viên chỉ thấy kết quả
          sau khi bạn công bố.
        </p>
      ) : null}

      {essays.map((question, index) => (
        <EssayCard
          key={question.id}
          index={index}
          question={question}
          input={inputs[question.id]!}
          disabled={save.isPending}
          onChange={(input) =>
            setInputs((current) => ({ ...current, [question.id]: input }))
          }
          onHistory={() => setHistoryOf(question.id)}
        />
      ))}

      {adjusting.length ? (
        <section
          aria-label="Điều chỉnh điểm"
          className="space-y-2 rounded-lg border border-warning/40 bg-warning-background p-4"
        >
          <p className="text-sm font-semibold">
            Bạn đang điều chỉnh {adjusting.length} câu đã chấm
            {published ? " sau khi đã công bố cho học viên" : ""}. Mọi thay đổi
            được ghi lại vĩnh viễn.
          </p>
        </section>
      ) : null}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 py-3 backdrop-blur">
        <p className="mr-auto text-sm text-muted">
          {attempt.status === "GRADED"
            ? "Đã chấm xong. Học viên chưa thấy kết quả cho đến khi bạn công bố."
            : published
              ? "Kết quả đã được công bố cho học viên."
              : `${payload.length} câu đã nhập điểm`}
        </p>
        <Button
          loading={save.isPending}
          loadingLabel="Đang lưu…"
          disabled={invalid || (open ? !payload.length : !adjusting.length)}
          onClick={() => (adjusting.length ? setAskingReason(true) : submit())}
        >
          {adjusting.length ? "Lưu điều chỉnh" : "Save Grade"}
        </Button>
        {attempt.status === "GRADED" ? (
          <Button
            variant="outline"
            loading={publish.isPending}
            loadingLabel="Đang công bố…"
            onClick={() =>
              publish.mutate(attempt.attemptId, {
                onSuccess: () =>
                  setToast({
                    tone: "info",
                    message: "Đã công bố kết quả cho học viên.",
                  }),
                onError: (error) =>
                  setToast({ tone: "error", message: saveError(error) }),
              })
            }
          >
            Publish Result
          </Button>
        ) : null}
      </div>
      {askingReason ? (
        <ReasonDialog
          count={adjusting.length}
          required={published}
          busy={save.isPending}
          onConfirm={submit}
          onClose={() => setAskingReason(false)}
        />
      ) : null}
      {historyOf ? (
        <HistoryDialog
          attemptId={attempt.attemptId}
          questionId={historyOf}
          onClose={() => setHistoryOf(null)}
        />
      ) : null}
      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onClose={closeToast} />
      ) : null}
    </div>
  );
}

/** /instructor/grading/attempts/[attemptId] */
export function GradingWorkspace({ attemptId }: { attemptId: string }) {
  const attempt = useGradingAttempt(attemptId);
  if (attempt.isPending)
    return <WorkspaceSkeleton />;
  if (attempt.error)
    return (
      <Failure error={attempt.error} retry={() => void attempt.refetch()} />
    );
  // Keeps the grader's inputs (and the success notice) across refetches.
  return <Workspace key={attempt.data.attemptId} attempt={attempt.data} />;
}
