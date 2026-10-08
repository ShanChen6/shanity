"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "@/components/ui/toast";
import { Failure } from "@/features/instructor/shared";
import { KatexText } from "@/features/quiz-player/KatexText";
import { ApiError, errorMessage } from "@/lib/api";
import {
  useGradingAttempt,
  usePublishAttempt,
  useSaveGrades,
} from "./api";
import {
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
}: {
  index: number;
  question: EssayQuestionView;
  input: GradeInput;
  disabled: boolean;
  onChange: (input: GradeInput) => void;
}) {
  const rubric = question.rubric?.length ? question.rubric : null;
  const issue = gradeIssue(question, input);
  const awarded = awardedOf(question, input);
  const graded = question.grading?.status === "GRADED";
  const text = question.essayAnswer?.text?.trim();
  const files = question.essayAnswer?.attachments ?? [];
  return (
    <article
      aria-label={`Câu tự luận ${index + 1}`}
      className="grid gap-5 rounded-lg border border-border bg-surface p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            Câu {index + 1} · tối đa {question.points} điểm
          </span>
          <Badge tone={graded ? "success" : "warning"}>
            {graded ? "Đã chấm" : "Chưa chấm"}
          </Badge>
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
        className="space-y-3 rounded-md border border-border-strong p-3 lg:self-start"
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
              Tổng: {awarded ?? "—"} / {question.points}
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
            <span className="tabular-nums">/ {question.points}</span>
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

function Workspace({ attempt }: { attempt: GradingAttempt }) {
  const [inputs, setInputs] = useState(() => initialInputs(attempt));
  const [toast, setToast] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(null);
  const [final, setFinal] = useState<GradeResult | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const save = useSaveGrades(attempt.attemptId);
  const publish = usePublishAttempt();
  const essays = essaysOf(attempt);
  const open = attempt.status === "NEEDS_GRADING";
  const payload = gradesPayload(attempt, inputs);
  const invalid = essays.some((question) => {
    const input = inputs[question.id];
    return input ? gradeIssue(question, input) !== null : false;
  });

  function submit() {
    save.mutate(payload, {
      onSuccess: (result) => {
        setFinal(result);
        setToast({
          tone: "info",
          message: result.result
            ? `Đã lưu điểm. Bài đã chấm xong: ${result.result.earnedPoints}/${result.result.totalPoints} điểm (${result.result.percentage}%).`
            : `Đã lưu điểm. Còn ${result.remainingUngradedCount} câu chưa chấm.`,
        });
      },
      onError: (error) =>
        setToast({ tone: "error", message: saveError(error) }),
    });
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
          disabled={!open || save.isPending}
          onChange={(input) =>
            setInputs((current) => ({ ...current, [question.id]: input }))
          }
        />
      ))}

      {open ? (
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-surface/95 py-3 backdrop-blur">
          <p className="text-sm text-muted">
            {payload.length} câu đã nhập điểm
          </p>
          <Button
            loading={save.isPending}
            loadingLabel="Đang lưu…"
            disabled={!payload.length || invalid}
            onClick={submit}
          >
            Save Grade
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3">
          <p className="text-sm text-muted">
            {attempt.status === "GRADED"
              ? "Đã chấm xong. Học viên chưa thấy kết quả cho đến khi bạn công bố."
              : "Kết quả đã được công bố cho học viên."}
          </p>
          {attempt.status === "GRADED" ? (
            <Button
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
      )}
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
    return <p className="text-sm text-muted">Đang tải bài làm…</p>;
  if (attempt.error)
    return (
      <Failure error={attempt.error} retry={() => void attempt.refetch()} />
    );
  // Keeps the grader's inputs (and the success notice) across refetches.
  return <Workspace key={attempt.data.attemptId} attempt={attempt.data} />;
}
