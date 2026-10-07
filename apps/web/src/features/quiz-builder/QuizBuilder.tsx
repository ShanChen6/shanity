"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, GitBranchPlus, Plus, Rocket, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "@/components/ui/toast";
import { Failure } from "@/features/instructor/shared";
import { slugify } from "@/features/instructor/data";
import { api, errorMessage } from "@/lib/api";
import {
  openNewVersion,
  publishGateIssues,
  publishQuiz,
  quizKey,
  quizzesKey,
  resolveTargetPath,
  saveQuiz,
  useQuiz,
} from "./api";
import {
  PUBLISH_ISSUE_LABEL,
  REVIEW_POLICIES,
  draftFromApi,
  draftIssues,
  emptyDraft,
  newKey,
  newQuestion,
  publishIssues,
  type ApiQuiz,
  type Issue,
  type QuizDraft,
  type ReviewPolicy,
} from "./model";
import { QuestionCard } from "./QuestionCard";
import { TargetSelector } from "./TargetSelector";

type Notice = { message: string; tone: "info" | "error" };
type Notify = (notice: Notice) => void;

/**
 * /instructor/quizzes/create (no id) and /instructor/quizzes/:id/edit. Owns
 * the toast so it survives the form remounting after publish or a new
 * version.
 */
export function QuizBuilder({ quizId }: { quizId?: string }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const close = useCallback(() => setNotice(null), []);
  return (
    <>
      {quizId ? (
        <ExistingQuiz quizId={quizId} notify={setNotice} />
      ) : (
        <BuilderForm quiz={null} initial={emptyDraft()} notify={setNotice} />
      )}
      {notice ? (
        <Toast message={notice.message} tone={notice.tone} onClose={close} />
      ) : null}
    </>
  );
}

function ExistingQuiz({ quizId, notify }: { quizId: string; notify: Notify }) {
  const quiz = useQuiz(quizId);
  const [initial, setInitial] = useState<{
    key: string;
    draft: QuizDraft;
  } | null>(null);
  const [pathError, setPathError] = useState<unknown>(null);
  const data = quiz.data;
  const stamp = data ? `${data.id}:${data.version}:${data.status}` : "";

  useEffect(() => {
    if (!data || initial?.key === stamp) return;
    let cancelled = false;
    resolveTargetPath(data)
      .then((path) => {
        if (!cancelled)
          setInitial({ key: stamp, draft: draftFromApi(data, path) });
      })
      .catch((error: unknown) => !cancelled && setPathError(error));
    return () => {
      cancelled = true;
    };
  }, [data, stamp, initial?.key]);

  if (quiz.error || pathError)
    return (
      <Failure
        error={quiz.error ?? pathError}
        retry={() => void quiz.refetch()}
      />
    );
  if (!data || !initial || initial.key !== stamp)
    return <p className="text-sm text-muted">Đang tải bài quiz…</p>;
  return (
    <BuilderForm
      key={stamp}
      quiz={data}
      initial={initial.draft}
      notify={notify}
    />
  );
}

function Section({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted">{description}</p>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  invalid,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  min: number;
  max: number;
  invalid?: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className="mt-2"
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <span className="mt-1 block text-xs font-normal text-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 text-sm font-medium">
      <span>
        {label}
        {hint ? (
          <span className="mt-0.5 block text-xs font-normal text-muted">
            {hint}
          </span>
        ) : null}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

const STATUS_TONE = {
  DRAFT: "warning",
  PUBLISHED: "success",
  ARCHIVED: "neutral",
} as const;
const STATUS_LABEL = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã xuất bản",
  ARCHIVED: "Đã lưu trữ",
};

function BuilderForm({
  quiz,
  initial,
  notify: setNotice,
}: {
  quiz: ApiQuiz | null;
  initial: QuizDraft;
  notify: Notify;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(quiz);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState<"save" | "publish" | "version" | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));

  const isNew = !saved;
  const readOnly = Boolean(saved && saved.status !== "DRAFT") || busy !== null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const update = (next: QuizDraft) => {
    setDraft(next);
    setDirty(true);
  };
  const issueFor = (field: string) =>
    issues
      .filter((issue) => issue.field === field)
      .map(({ message }) => message);
  const questionIssues = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of issues)
      if (issue.field.startsWith("question:")) {
        const key = issue.field.slice("question:".length);
        map.set(key, [...(map.get(key) ?? []), issue.message]);
      }
    return map;
  }, [issues]);

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function persist(): Promise<ApiQuiz> {
    const result = await saveQuiz(draft, saved);
    setSaved(result);
    client.setQueryData(quizKey(result.id), result);
    void client.invalidateQueries({ queryKey: quizzesKey });
    setDraft(
      draftFromApi(result, {
        courseId: draft.courseId,
        chapterId: draft.chapterId,
        lessonId: draft.lessonId,
      }),
    );
    setDirty(false);
    return result;
  }

  async function run(
    kind: "save" | "publish",
    check: (d: QuizDraft, n: boolean) => Issue[],
  ) {
    const found = check(draft, isNew);
    setIssues(found);
    setFailure(null);
    if (found.length) {
      setNotice({
        tone: "error",
        message: `Còn ${found.length} lỗi cần sửa trước khi ${kind === "save" ? "lưu" : "xuất bản"}.`,
      });
      return;
    }
    setBusy(kind);
    try {
      const result = await persist();
      // A new quiz now has an address. Shallow URL update: the form keeps its
      // state (issues, toast) instead of remounting.
      if (isNew)
        window.history.replaceState(
          null,
          "",
          `/instructor/quizzes/${result.id}/edit`,
        );
      if (kind === "publish") {
        const published = await publishQuiz(result.id);
        setNotice({
          tone: "info",
          message: `Đã xuất bản phiên bản ${published.version}.`,
        });
        const fresh = await api<ApiQuiz>(`/admin/quizzes/${result.id}`);
        setSaved(fresh);
        client.setQueryData(quizKey(result.id), fresh);
      } else setNotice({ tone: "info", message: "Đã lưu bản nháp." });
      void client.invalidateQueries({ queryKey: quizzesKey });
    } catch (error) {
      const gate = publishGateIssues(error);
      if (gate) {
        setIssues(
          gate.map((code) => ({
            field: "server",
            message: PUBLISH_ISSUE_LABEL[code] ?? code,
          })),
        );
        setNotice({
          tone: "error",
          message: "Máy chủ từ chối xuất bản: bài quiz chưa đạt yêu cầu.",
        });
      } else {
        setFailure(error);
        setNotice({ tone: "error", message: errorMessage(error) });
      }
    } finally {
      setBusy(null);
    }
  }

  async function newVersion() {
    if (!saved) return;
    setBusy("version");
    try {
      const opened = await openNewVersion(saved.id);
      const fresh = await api<ApiQuiz>(`/admin/quizzes/${saved.id}`);
      setSaved(fresh);
      client.setQueryData(quizKey(saved.id), fresh);
      void client.invalidateQueries({ queryKey: quizzesKey });
      setNotice({
        tone: "info",
        message: `Đã mở phiên bản ${opened.version} để chỉnh sửa. Học viên đang làm bài không bị ảnh hưởng.`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = draft.questions.findIndex(
      (question) => question.key === active.id,
    );
    const to = draft.questions.findIndex(
      (question) => question.key === over.id,
    );
    if (from < 0 || to < 0) return;
    update({ ...draft, questions: arrayMove(draft.questions, from, to) });
  };

  const totalPoints = draft.questions.reduce(
    (sum, question) => sum + (Number(question.points) || 0),
    0,
  );
  const generalIssues = issues.filter(
    (issue) => issue.field === "server" || issue.field === "questions",
  );

  return (
    <div className="pb-24 lg:pb-0">
      <Link href="/instructor/quizzes" className="text-sm">
        ← Danh sách quiz
      </Link>
      <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="instructor-eyebrow">QUIZ BUILDER</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {isNew ? "Tạo bài quiz mới" : draft.title || "Chỉnh sửa quiz"}
          </h1>
          {saved ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <Badge tone={STATUS_TONE[saved.status]}>
                {STATUS_LABEL[saved.status]}
              </Badge>
              <span>Phiên bản {saved.version}</span>
              <span aria-hidden>·</span>
              <span>{saved.attemptCount} lượt làm bài</span>
              {dirty ? <Badge tone="info">Chưa lưu</Badge> : null}
            </div>
          ) : null}
        </div>
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-surface p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
          {saved?.status === "PUBLISHED" ? (
            <Button
              className="flex-1 lg:flex-none"
              loading={busy === "version"}
              onClick={() => void newVersion()}
            >
              <GitBranchPlus aria-hidden size={16} /> Tạo phiên bản mới
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="flex-1 lg:flex-none"
                disabled={readOnly}
                loading={busy === "save"}
                loadingLabel="Đang lưu…"
                onClick={() => void run("save", draftIssues)}
              >
                <Save aria-hidden size={16} /> Lưu nháp
              </Button>
              <Button
                className="flex-1 lg:flex-none"
                disabled={readOnly}
                loading={busy === "publish"}
                loadingLabel="Đang xuất bản…"
                onClick={() => void run("publish", publishIssues)}
              >
                <Rocket aria-hidden size={16} /> Xuất bản
              </Button>
            </>
          )}
        </div>
      </div>

      {saved?.status === "PUBLISHED" ? (
        <p className="mb-6 flex items-start gap-3 rounded-lg border border-info/40 bg-info-background p-4 text-sm text-info-foreground">
          <AlertTriangle aria-hidden size={18} className="mt-0.5 shrink-0" />
          Bài quiz đang được dùng. Để sửa, hãy tạo phiên bản mới: các lượt làm
          bài cũ vẫn được chấm và hiển thị theo phiên bản cũ. Trong lúc soạn,
          học viên tạm thời chưa bắt đầu được lượt mới.
        </p>
      ) : saved?.status === "ARCHIVED" ? (
        <p className="mb-6 rounded-lg border border-border bg-surface-secondary p-4 text-sm text-muted">
          Bài quiz đã lưu trữ và chỉ có thể xem.
        </p>
      ) : null}

      {generalIssues.length || failure ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-danger/40 bg-danger-background p-4 text-sm text-danger-foreground"
        >
          {generalIssues.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {generalIssues.map((issue) => (
                <li key={issue.message}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {failure && !generalIssues.length ? (
            <p>{errorMessage(failure)}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Thông tin chung">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium md:col-span-2">
                Tiêu đề
                <Input
                  className="mt-2"
                  value={draft.title}
                  maxLength={255}
                  disabled={readOnly}
                  placeholder="Ví dụ: Chương 1 — Tổng quan TypeScript"
                  aria-invalid={issueFor("title").length ? true : undefined}
                  onChange={(event) =>
                    update({
                      ...draft,
                      title: event.target.value,
                      slug: slugTouched
                        ? draft.slug
                        : slugify(event.target.value),
                    })
                  }
                />
                <FieldError messages={issueFor("title")} />
              </label>
              <label className="block text-sm font-medium md:col-span-2">
                Slug{" "}
                {draft.scope === "STANDALONE" ? null : (
                  <span className="font-normal text-muted">(tùy chọn)</span>
                )}
                <Input
                  className="mt-2"
                  value={draft.slug}
                  maxLength={255}
                  disabled={readOnly}
                  aria-invalid={issueFor("slug").length ? true : undefined}
                  onChange={(event) => {
                    setSlugTouched(true);
                    update({ ...draft, slug: event.target.value });
                  }}
                />
                <FieldError messages={issueFor("slug")} />
              </label>
              <label className="block text-sm font-medium">
                Độ khó{" "}
                <span className="font-normal text-muted">(tùy chọn)</span>
                <Select
                  className="mt-2"
                  value={draft.difficulty}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({
                      ...draft,
                      difficulty: event.target.value as QuizDraft["difficulty"],
                    })
                  }
                >
                  <option value="">Không đặt</option>
                  <option value="BEGINNER">Cơ bản</option>
                  <option value="INTERMEDIATE">Trung cấp</option>
                  <option value="ADVANCED">Nâng cao</option>
                </Select>
              </label>
              <label className="block text-sm font-medium">
                Tag{" "}
                <span className="font-normal text-muted">
                  (phân tách bằng dấu phẩy)
                </span>
                <Input
                  className="mt-2"
                  value={draft.tags}
                  disabled={readOnly}
                  placeholder="javascript, cơ bản"
                  aria-invalid={issueFor("tags").length ? true : undefined}
                  onChange={(event) =>
                    update({ ...draft, tags: event.target.value })
                  }
                />
                <FieldError messages={issueFor("tags")} />
              </label>
              <label className="block text-sm font-medium md:col-span-2">
                Mô tả <span className="font-normal text-muted">(tùy chọn)</span>
                <Textarea
                  className="mt-2 !min-h-20"
                  value={draft.description}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({ ...draft, description: event.target.value })
                  }
                />
              </label>
            </div>
          </Section>

          <Section title="Vị trí trong khóa học">
            <TargetSelector
              draft={draft}
              locked={!isNew}
              readOnly={readOnly}
              error={issueFor("target")[0]}
              onChange={update}
            />
          </Section>

          <Section
            title="Câu hỏi"
            description={`${draft.questions.length} câu · ${totalPoints} điểm. Kéo biểu tượng ⋮⋮ để sắp xếp.`}
            aside={
              <Button
                variant="outline"
                size="sm"
                disabled={readOnly}
                onClick={() =>
                  update({
                    ...draft,
                    questions: [...draft.questions, newQuestion()],
                  })
                }
              >
                <Plus aria-hidden size={14} /> Thêm câu hỏi
              </Button>
            }
          >
            {draft.questions.length ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={draft.questions.map(({ key }) => key)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="space-y-4">
                    {draft.questions.map((question, index) => (
                      <QuestionCard
                        key={question.key}
                        question={question}
                        index={index}
                        issues={questionIssues.get(question.key) ?? []}
                        readOnly={readOnly}
                        canRemove={draft.questions.length > 1}
                        onChange={(next) =>
                          update({
                            ...draft,
                            questions: draft.questions.map((item) =>
                              item.key === question.key ? next : item,
                            ),
                          })
                        }
                        onRemove={() =>
                          update({
                            ...draft,
                            questions: draft.questions.filter(
                              (item) => item.key !== question.key,
                            ),
                          })
                        }
                        onDuplicate={() => {
                          const copy = {
                            ...question,
                            key: newKey(),
                            id: undefined,
                            options: question.options.map((option) => ({
                              ...option,
                              key: newKey(),
                              id: undefined,
                            })),
                          };
                          const questions = [...draft.questions];
                          questions.splice(index + 1, 0, copy);
                          update({ ...draft, questions });
                        }}
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
                Chưa có câu hỏi nào.
              </p>
            )}
          </Section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <Section title="Cài đặt bài quiz">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <NumberField
                label="Điểm đạt (%)"
                value={draft.passingScore}
                min={1}
                max={100}
                disabled={readOnly}
                invalid={issueFor("passingScore").length > 0}
                hint={issueFor("passingScore")[0] ?? "Từ 1 đến 100."}
                onChange={(passingScore) => update({ ...draft, passingScore })}
              />
              <NumberField
                label="Số lượt làm tối đa"
                value={draft.maxAttempts}
                min={0}
                max={32767}
                disabled={readOnly}
                invalid={issueFor("maxAttempts").length > 0}
                hint={issueFor("maxAttempts")[0] ?? "0 = không giới hạn."}
                onChange={(maxAttempts) => update({ ...draft, maxAttempts })}
              />
              <NumberField
                label="Thời gian (phút)"
                value={draft.durationMinutes}
                min={0}
                max={1440}
                disabled={readOnly}
                invalid={issueFor("durationMinutes").length > 0}
                hint={
                  issueFor("durationMinutes")[0] ??
                  "0 = không giới hạn thời gian."
                }
                onChange={(durationMinutes) =>
                  update({ ...draft, durationMinutes })
                }
              />
              <label className="block text-sm font-medium">
                Xem đáp án sau khi nộp
                <Select
                  className="mt-2"
                  value={draft.reviewPolicy}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({
                      ...draft,
                      reviewPolicy: event.target.value as ReviewPolicy,
                    })
                  }
                >
                  {REVIEW_POLICIES.map((policy) => (
                    <option key={policy.value} value={policy.value}>
                      {policy.label}
                    </option>
                  ))}
                  {draft.reviewPolicy === "AFTER_EXHAUSTED" ? (
                    <option value="AFTER_EXHAUSTED">
                      Khi đã dùng hết lượt
                    </option>
                  ) : null}
                </Select>
              </label>
            </div>
            <div className="mt-5 space-y-4 border-t border-border pt-5">
              <ToggleRow
                label="Bắt buộc"
                hint={
                  draft.scope === "STANDALONE"
                    ? "Quiz độc lập không thể bắt buộc."
                    : "Học viên phải đạt mới được tính hoàn thành khóa học."
                }
                checked={draft.isRequired}
                disabled={readOnly || draft.scope === "STANDALONE"}
                onChange={(isRequired) => update({ ...draft, isRequired })}
              />
              <ToggleRow
                label="Xáo trộn câu hỏi"
                checked={draft.shuffleQuestions}
                disabled={readOnly}
                onChange={(shuffleQuestions) =>
                  update({ ...draft, shuffleQuestions })
                }
              />
              <ToggleRow
                label="Xáo trộn đáp án"
                checked={draft.shuffleOptions}
                disabled={readOnly}
                onChange={(shuffleOptions) =>
                  update({ ...draft, shuffleOptions })
                }
              />
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function FieldError({ messages }: { messages: string[] }) {
  return messages.length ? (
    <span className="mt-1 block text-xs font-normal text-danger-foreground">
      {messages[0]}
    </span>
  ) : null;
}
