"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Radio } from "@/components/ui/radio";
import { Toast } from "@/components/ui/toast";
import { ApiError, errorMessage } from "@/lib/api";
import {
  saveAnswer,
  saveDraft,
  submitAttempt,
  type Attempt,
  type EssayAnswerValue,
  type SavedAnswer,
  uploadEssayAttachment,
} from "./api";
import { EssayAnswerInput, hasEssayContent } from "./EssayAnswerInput";
import { AutosaveQueue, formatRemaining, type SaveState } from "./autosave";

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/**
 * The exam UI shared by course and standalone quizzes: one question at a
 * time with a navigator grid, autosave on every choice, a countdown on the
 * server's clock and an idempotent submit. When time runs out it submits by
 * itself and says so in a modal; `onClosed` then leads to the result.
 */
export function AttemptRunner({
  title,
  attempt,
  onClosed,
}: {
  title: string;
  attempt: Attempt;
  onClosed: (attemptId: string) => void;
}) {
  const questions = attempt.quiz?.questions ?? [];
  const [selections, setSelections] = useState(
    () =>
      new Map(
        (attempt.answers ?? []).map((answer) => [
          answer.questionId,
          answer.selectedOptionIds,
        ]),
      ),
  );
  // Essay drafts restored from the server (`answers[].essayAnswer`).
  const [essays, setEssays] = useState(
    () =>
      new Map<string, EssayAnswerValue>(
        (attempt.answers ?? []).flatMap((answer) =>
          answer.essayAnswer ? [[answer.questionId, answer.essayAnswer]] : [],
        ),
      ),
  );
  // Essay saves in flight (also after their question was left) and the
  // visible essay's flush, awaited before submitting.
  const essaySaves = useRef(new Set<Promise<unknown>>());
  const essayFlush = useRef<(() => Promise<void>) | null>(null);
  const [saveStates, setSaveStates] = useState<ReadonlyMap<string, SaveState>>(
    new Map(),
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(() => {
    const times = (attempt.answers ?? []).map(({ savedAt }) => savedAt).sort();
    return times.at(-1) ?? null;
  });
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [timedOut, setTimedOut] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const closed = useRef(false);
  // Server clock minus ours: a wrong device clock cannot stretch the timer.
  const [offset] = useState(() => Date.parse(attempt.serverNow) - Date.now());
  const deadline = attempt.expiresAt ? Date.parse(attempt.expiresAt) : null;
  const [now, setNow] = useState(() => Date.now() + offset);

  const finish = useCallback(
    (closedAttempt: Pick<Attempt, "id" | "status">) => {
      if (closed.current) return;
      closed.current = true;
      if (closedAttempt.status === "TIMED_OUT") setTimedOut(closedAttempt.id);
      else onClosed(closedAttempt.id);
    },
    [onClosed],
  );

  // Created on first use (an event), never during render.
  const queueRef = useRef<AutosaveQueue<SavedAnswer> | null>(null);
  const queue = () =>
    (queueRef.current ??= new AutosaveQueue<SavedAnswer>(
      (questionId, selection) => saveAnswer(attempt.id, questionId, selection),
      (questionId, state, error, saved) => {
        setSaveStates((map) => new Map(map).set(questionId, state));
        if (saved) setLastSavedAt(saved.savedAt);
        // The server closed it at the deadline: show the timeout modal.
        if (error instanceof ApiError && error.code === "ATTEMPT_EXPIRED") {
          const closedAttempt = error.data.attempt as Attempt | undefined;
          finish({ id: closedAttempt?.id ?? attempt.id, status: "TIMED_OUT" });
        } else if (
          error instanceof ApiError &&
          error.code === "ATTEMPT_NOT_IN_PROGRESS"
        )
          finish({ id: attempt.id, status: "SUBMITTED" });
        else if (error)
          setToast(`Chưa lưu được câu trả lời. ${errorMessage(error)}`);
      },
    ));

  const submit = useCallback(async () => {
    if (closed.current) return;
    setSubmitting(true);
    setConfirming(false);
    await essayFlush.current?.();
    await Promise.allSettled([...essaySaves.current]);
    await queue().flush();
    // Another tab or a retry may hold the submission: wait for its result.
    for (let tries = 0; tries < 10; tries++) {
      try {
        finish(await submitAttempt(attempt.id));
        return;
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === "SUBMISSION_IN_PROGRESS"
        ) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          continue;
        }
        if (
          error instanceof ApiError &&
          error.code === "ATTEMPT_NOT_IN_PROGRESS"
        ) {
          finish({ id: attempt.id, status: "SUBMITTED" });
          return;
        }
        setToast(`Không nộp được bài. ${errorMessage(error)}`);
        setSubmitting(false);
        return;
      }
    }
    setSubmitting(false);
    setToast("Bài đang được chấm lâu hơn dự kiến. Vui lòng thử lại.");
    // `queue` is a lazy getter over a ref: stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.id, finish]);

  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [deadline, offset]);
  const remaining = deadline === null ? null : deadline - now;
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !closed.current) void submit();
  }, [remaining, submit]);

  const answered = (questionId: string) =>
    (selections.get(questionId) ?? []).length > 0 ||
    hasEssayContent(essays.get(questionId));
  const answeredCount = questions.filter(({ id }) => answered(id)).length;
  const saving = [...saveStates.values()].includes("saving");
  const question = questions[current];
  // The draft the server returned, not the live edits: it seeds the editor.
  const savedEssay = (questionId: string) =>
    attempt.answers?.find((answer) => answer.questionId === questionId)
      ?.essayAnswer;

  function saveEssay(questionId: string, answer: EssayAnswerValue) {
    const save = saveDraft(attempt.id, questionId, { essayAnswer: answer });
    const tracked = save.finally(() => essaySaves.current.delete(tracked));
    essaySaves.current.add(tracked);
    return save.then(
      (saved) => {
        setLastSavedAt(saved.savedAt);
        return saved;
      },
      (error: unknown) => {
        // Past the deadline the server closed the attempt: same as MCQ.
        if (error instanceof ApiError && error.code === "ATTEMPT_EXPIRED") {
          const closedAttempt = error.data.attempt as Attempt | undefined;
          finish({ id: closedAttempt?.id ?? attempt.id, status: "TIMED_OUT" });
        } else if (
          error instanceof ApiError &&
          error.code === "ATTEMPT_NOT_IN_PROGRESS"
        )
          finish({ id: attempt.id, status: "SUBMITTED" });
        throw error;
      },
    );
  }

  function choose(optionId: string, checked: boolean) {
    if (!question) return;
    const single = question.type === "SINGLE_CHOICE";
    const previous = selections.get(question.id) ?? [];
    const next = single
      ? [optionId]
      : checked
        ? [...new Set([...previous, optionId])]
        : previous.filter((id) => id !== optionId);
    setSelections((map) => new Map(map).set(question.id, next));
    queue().save(question.id, next);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
            {title}
          </h1>
          {remaining !== null ? (
            <span
              role="timer"
              aria-label="Thời gian còn lại"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums ${
                remaining < 60_000
                  ? "bg-danger-background text-danger-foreground"
                  : "bg-surface-secondary"
              }`}
            >
              <Clock aria-hidden size={15} /> {formatRemaining(remaining)}
            </span>
          ) : null}
          <Button
            loading={submitting}
            loadingLabel="Đang nộp…"
            disabled={Boolean(timedOut)}
            onClick={() =>
              answeredCount < questions.length
                ? setConfirming(true)
                : void submit()
            }
          >
            Nộp bài
          </Button>
        </div>
        <p
          className="mx-auto max-w-6xl px-4 pb-2 text-xs text-muted"
          aria-live="polite"
          data-testid="autosave-status"
        >
          {saving
            ? "Đang lưu đáp án…"
            : [...saveStates.values()].includes("error")
              ? "Có đáp án chưa lưu được — hãy chọn lại."
              : lastSavedAt
                ? `Đã lưu đáp án lúc ${timeOf(lastSavedAt)}`
                : "Đáp án được lưu tự động khi bạn chọn."}
        </p>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section aria-label={`Câu ${current + 1}`} className="min-w-0">
          {question ? (
            <div className="rounded-lg border border-border bg-surface p-4 sm:p-6">
              <p className="text-xs text-muted">
                Câu {current + 1}/{questions.length} · {question.points} điểm ·{" "}
                {question.type === "ESSAY"
                  ? "Tự luận"
                  : question.type === "SINGLE_CHOICE"
                    ? "Chọn 1 đáp án"
                    : "Chọn tất cả đáp án đúng"}
              </p>
              <h2 className="mt-2 whitespace-pre-line text-lg font-medium">
                {question.content}
              </h2>
              {question.type === "ESSAY" ? (
                <div className="mt-5">
                  <EssayAnswerInput
                    key={question.id}
                    config={question.essayConfig}
                    initial={savedEssay(question.id)}
                    initialSavedAt={
                      attempt.answers?.find(
                        ({ questionId }) => questionId === question.id,
                      )?.savedAt
                    }
                    disabled={submitting || Boolean(timedOut)}
                    flushRef={essayFlush}
                    onUpload={(file) => uploadEssayAttachment(attempt.id, file)}
                    onSave={(answer) => saveEssay(question.id, answer)}
                    onChange={(answer) =>
                      setEssays((map) => new Map(map).set(question.id, answer))
                    }
                  />
                </div>
              ) : (
                <fieldset
                  className="mt-5"
                  disabled={submitting || Boolean(timedOut)}
                >
                  <legend className="sr-only">Đáp án</legend>
                  <ul className="space-y-2">
                    {question.options.map((option) => {
                      const checked = (
                        selections.get(question.id) ?? []
                      ).includes(option.id);
                      const Control =
                        question.type === "SINGLE_CHOICE" ? Radio : Checkbox;
                      return (
                        <li key={option.id}>
                          <label
                            className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                              checked
                                ? "border-primary bg-secondary"
                                : "border-border hover:bg-surface-hover"
                            }`}
                          >
                            <Control
                              name={`answer-${question.id}`}
                              checked={checked}
                              onChange={(event) =>
                                choose(option.id, event.target.checked)
                              }
                            />
                            <span className="min-w-0 flex-1">
                              {option.content}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
              <div className="mt-6 flex justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={current === 0}
                  onClick={() => setCurrent(current - 1)}
                >
                  <ChevronLeft aria-hidden size={16} /> Câu trước
                </Button>
                <Button
                  variant="outline"
                  disabled={current >= questions.length - 1}
                  onClick={() => setCurrent(current + 1)}
                >
                  Câu sau <ChevronRight aria-hidden size={16} />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Bài quiz không có câu hỏi.</p>
          )}
        </section>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <nav
            aria-label="Danh sách câu hỏi"
            className="rounded-lg border border-border bg-surface p-4"
          >
            <p className="mb-3 text-sm font-medium">
              Đã trả lời {answeredCount}/{questions.length}
            </p>
            <ol className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
              {questions.map((item, index) => {
                const done = answered(item.id);
                const active = index === current;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setCurrent(index)}
                      aria-current={active ? "step" : undefined}
                      aria-label={`Câu ${index + 1}${done ? ", đã trả lời" : ", chưa trả lời"}`}
                      data-state={done ? "answered" : "empty"}
                      className={`flex size-9 items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors ${
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong bg-transparent hover:bg-surface-hover"
                      } ${active ? "ring-2 ring-offset-2 ring-primary ring-offset-surface" : ""}`}
                    >
                      {index + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>
      </div>

      {confirming ? (
        <Dialog
          title="Nộp bài?"
          description={`Còn ${questions.length - answeredCount} câu chưa trả lời. Câu chưa trả lời được tính 0 điểm.`}
          onClose={() => setConfirming(false)}
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Làm tiếp
            </Button>
            <Button onClick={() => void submit()}>Vẫn nộp bài</Button>
          </div>
        </Dialog>
      ) : null}
      {timedOut ? (
        <Dialog
          title="Hết giờ làm bài"
          description="Thời gian làm bài đã hết theo đồng hồ máy chủ. Bài của bạn đã được tự động nộp với các đáp án đã lưu."
          busy
          onClose={() => onClosed(timedOut)}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-warning-background text-warning-foreground">
              <AlarmClock aria-hidden size={28} />
            </span>
            <Button
              className="w-full sm:w-auto"
              onClick={() => onClosed(timedOut)}
            >
              Xem kết quả
            </Button>
          </div>
        </Dialog>
      ) : null}
      {toast ? (
        <Toast tone="error" message={toast} onClose={closeToast} />
      ) : null}
    </div>
  );
}
