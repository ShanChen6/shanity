// Pure model of the instructor Quiz Builder: form state, API mapping, the
// client-side publish check and the question sync plan. No React, no fetch.

export type QuizScope = "LESSON" | "CHAPTER" | "COURSE" | "STANDALONE";
export type QuizStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ReviewPolicy =
  "NEVER" | "AFTER_SUBMIT" | "AFTER_PASS" | "AFTER_EXHAUSTED";
export type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "ESSAY";
export type Difficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export const SCOPES: ReadonlyArray<{
  value: QuizScope;
  label: string;
  hint: string;
}> = [
  { value: "LESSON", label: "Bài học", hint: "Gắn vào một bài học cụ thể" },
  { value: "CHAPTER", label: "Chương", hint: "Kiểm tra cuối chương" },
  { value: "COURSE", label: "Khóa học", hint: "Bài thi cuối khóa" },
  { value: "STANDALONE", label: "Độc lập", hint: "Không thuộc khóa học nào" },
];

export const REVIEW_POLICIES: ReadonlyArray<{
  value: ReviewPolicy;
  label: string;
}> = [
  { value: "AFTER_SUBMIT", label: "Hiện đáp án ngay sau khi nộp" },
  { value: "AFTER_PASS", label: "Chỉ hiện đáp án khi đạt" },
  { value: "NEVER", label: "Không bao giờ hiện đáp án" },
];

// GET /admin/quizzes/:id
export type ApiOption = {
  id: string;
  content: string;
  position: number;
  isCorrect: boolean;
};
export type EssaySubmissionType = "TEXT_WITH_KATEX" | "FILE_UPLOAD";
export type RubricCriterion = {
  criterion: string;
  maxPoints: number;
  description?: string;
};
export type ApiEssayConfig = {
  allowedSubmissionTypes: EssaySubmissionType[];
  maxFileUploads: number;
  maxWords?: number;
  gradingGuide?: string;
  rubric?: RubricCriterion[];
};
export type ApiQuestion = {
  id: string;
  type: QuestionType;
  content: string;
  position: number;
  points: number;
  explanation: string | null;
  essayConfig?: ApiEssayConfig | null;
  options: ApiOption[];
};
export type ApiQuiz = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  scope: QuizScope;
  targetId: string | null;
  courseId: string | null;
  status: QuizStatus;
  version: number;
  passingScore: number;
  maxAttempts: number | null;
  durationMinutes: number | null;
  isRequired: boolean;
  reviewPolicy: ReviewPolicy;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  difficulty: Difficulty | null;
  tags: string[];
  attemptCount: number;
  publishedAt: string | null;
  questions: ApiQuestion[];
};

// Form state. Numbers stay strings while typed; `key` is a stable React key
// and `id` the server id once saved.
export type OptionDraft = {
  key: string;
  id?: string;
  content: string;
  isCorrect: boolean;
};
// Essay settings. `points` is the essay's Max Points; only the grading guide
// is edited here, the rest is carried through unchanged.
export type EssayDraft = {
  gradingGuide: string;
  allowedSubmissionTypes: EssaySubmissionType[];
  maxFileUploads: number;
  maxWords?: number;
  rubric?: RubricCriterion[];
};
export type QuestionDraft = {
  key: string;
  id?: string;
  type: QuestionType;
  content: string;
  points: string;
  explanation: string;
  essay?: EssayDraft;
  options: OptionDraft[];
};
export type QuizDraft = {
  title: string;
  slug: string;
  description: string;
  scope: QuizScope;
  courseId: string;
  chapterId: string;
  lessonId: string;
  passingScore: string;
  // "0" means unlimited.
  maxAttempts: string;
  // "0" or empty means untimed.
  durationMinutes: string;
  reviewPolicy: ReviewPolicy;
  isRequired: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  difficulty: Difficulty | "";
  // Comma separated while typed.
  tags: string;
  questions: QuestionDraft[];
};

let counter = 0;
export const newKey = () =>
  `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const newOption = (isCorrect = false): OptionDraft => ({
  key: newKey(),
  content: "",
  isCorrect,
});
export const newEssay = (): EssayDraft => ({
  gradingGuide: "",
  allowedSubmissionTypes: ["TEXT_WITH_KATEX", "FILE_UPLOAD"],
  maxFileUploads: 3,
});
export const newQuestion = (): QuestionDraft => ({
  key: newKey(),
  type: "SINGLE_CHOICE",
  content: "",
  points: "1",
  explanation: "",
  options: [newOption(true), newOption()],
});

export const emptyDraft = (): QuizDraft => ({
  title: "",
  slug: "",
  description: "",
  scope: "LESSON",
  courseId: "",
  chapterId: "",
  lessonId: "",
  passingScore: "80",
  maxAttempts: "0",
  durationMinutes: "15",
  reviewPolicy: "AFTER_SUBMIT",
  isRequired: false,
  shuffleQuestions: true,
  shuffleOptions: true,
  difficulty: "",
  tags: "",
  questions: [newQuestion()],
});

/** The target id the API expects for the chosen scope. */
export function targetIdOf(draft: QuizDraft): string | null {
  switch (draft.scope) {
    case "LESSON":
      return draft.lessonId || null;
    case "CHAPTER":
      return draft.chapterId || null;
    case "COURSE":
      return draft.courseId || null;
    default:
      return null;
  }
}

/** Switching scope drops the selections the new scope cannot use. */
export function withScope(draft: QuizDraft, scope: QuizScope): QuizDraft {
  return {
    ...draft,
    scope,
    courseId: scope === "STANDALONE" ? "" : draft.courseId,
    chapterId: scope === "LESSON" || scope === "CHAPTER" ? draft.chapterId : "",
    lessonId: scope === "LESSON" ? draft.lessonId : "",
    // A standalone quiz gates no curriculum, so it can never be required.
    isRequired: scope === "STANDALONE" ? false : draft.isRequired,
  };
}

/** Changing a parent selection clears its descendants. */
export function withCourse(draft: QuizDraft, courseId: string): QuizDraft {
  return { ...draft, courseId, chapterId: "", lessonId: "" };
}
export function withChapter(draft: QuizDraft, chapterId: string): QuizDraft {
  return { ...draft, chapterId, lessonId: "" };
}

/** A SINGLE_CHOICE question keeps exactly one correct option. */
export function markCorrect(
  question: QuestionDraft,
  optionKey: string,
  checked: boolean,
): QuestionDraft {
  return {
    ...question,
    options: question.options.map((option) =>
      question.type === "SINGLE_CHOICE"
        ? { ...option, isCorrect: option.key === optionKey }
        : option.key === optionKey
          ? { ...option, isCorrect: checked }
          : option,
    ),
  };
}

/**
 * Switching to ESSAY hides the options (they are kept, so switching back
 * loses nothing); switching to SINGLE_CHOICE keeps only the first correct one.
 */
export function withType(
  question: QuestionDraft,
  type: QuestionType,
): QuestionDraft {
  if (type === "ESSAY")
    return { ...question, type, essay: question.essay ?? newEssay() };
  if (type === "MULTIPLE_CHOICE") return { ...question, type };
  const first = question.options.findIndex((option) => option.isCorrect);
  return {
    ...question,
    type,
    options: question.options.map((option, index) => ({
      ...option,
      isCorrect: index === first,
    })),
  };
}

const integer = (value: string) =>
  /^\d+$/.test(value.trim()) ? Number(value) : NaN;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type Issue = { field: string; message: string };

/** Problems that block saving a draft at all (settings only). */
export function draftIssues(draft: QuizDraft, isNew: boolean): Issue[] {
  const issues: Issue[] = [];
  if (draft.title.trim().length < 3)
    issues.push({ field: "title", message: "Tiêu đề cần ít nhất 3 ký tự." });
  const tags = tagsOf(draft.tags);
  if (tags.length > 10 || tags.some((tag) => tag.length > 32))
    issues.push({
      field: "tags",
      message: "Tối đa 10 tag, mỗi tag tối đa 32 ký tự.",
    });
  if (draft.slug && !SLUG.test(draft.slug))
    issues.push({
      field: "slug",
      message: "Slug chỉ gồm chữ thường, số và dấu gạch ngang.",
    });
  if (isNew && draft.scope !== "STANDALONE" && !targetIdOf(draft))
    issues.push({
      field: "target",
      message:
        draft.scope === "LESSON"
          ? "Chọn khóa học, chương và bài học."
          : draft.scope === "CHAPTER"
            ? "Chọn khóa học và chương."
            : "Chọn khóa học.",
    });
  const passing = integer(draft.passingScore);
  if (!(passing >= 1 && passing <= 100))
    issues.push({ field: "passingScore", message: "Điểm đạt từ 1 đến 100%." });
  const attempts = integer(draft.maxAttempts);
  if (!(attempts >= 0 && attempts <= 32767))
    issues.push({
      field: "maxAttempts",
      message: "Số lượt là số nguyên ≥ 0 (0 = không giới hạn).",
    });
  const duration = draft.durationMinutes.trim()
    ? integer(draft.durationMinutes)
    : 0;
  if (!(duration >= 0 && duration <= 1440))
    issues.push({
      field: "durationMinutes",
      message: "Thời gian từ 0 đến 1440 phút (0 = không giới hạn).",
    });
  return issues;
}

/** Everything the server's publish gate checks, plus the draft rules. */
export function publishIssues(draft: QuizDraft, isNew: boolean): Issue[] {
  const issues = draftIssues(draft, isNew);
  if (draft.scope === "STANDALONE" && !draft.slug)
    issues.push({
      field: "slug",
      message: "Quiz độc lập cần slug để học viên tìm thấy.",
    });
  if (!draft.questions.length)
    issues.push({ field: "questions", message: "Cần ít nhất 1 câu hỏi." });
  draft.questions.forEach((question, index) => {
    const at = `Câu ${index + 1}`;
    const field = `question:${question.key}`;
    if (!question.content.trim())
      issues.push({ field, message: `${at}: nhập nội dung câu hỏi.` });
    if (!(integer(question.points) >= 1))
      issues.push({ field, message: `${at}: điểm phải là số nguyên ≥ 1.` });
    if (question.type === "ESSAY") {
      const rubricSum = rubricTotal(question.essay?.rubric);
      if (rubricSum !== null && rubricSum !== integer(question.points))
        issues.push({
          field,
          message: `${at}: tổng điểm rubric (${rubricSum}) phải bằng điểm tối đa.`,
        });
      return;
    }
    if (question.options.length < 2)
      issues.push({ field, message: `${at}: cần ít nhất 2 đáp án.` });
    if (question.options.some((option) => !option.content.trim()))
      issues.push({ field, message: `${at}: có đáp án đang để trống.` });
    const correct = question.options.filter(
      (option) => option.isCorrect,
    ).length;
    if (correct < 1)
      issues.push({ field, message: `${at}: đánh dấu ít nhất 1 đáp án đúng.` });
    if (question.type === "SINGLE_CHOICE" && correct > 1)
      issues.push({
        field,
        message: `${at}: câu một lựa chọn chỉ có 1 đáp án đúng.`,
      });
    if (
      question.type === "MULTIPLE_CHOICE" &&
      correct === question.options.length &&
      correct > 0
    )
      issues.push({
        field,
        message: `${at}: câu nhiều lựa chọn cần ít nhất 1 đáp án sai.`,
      });
  });
  return issues;
}

/** Quiz settings for POST (with scope/target) or PUT (without). */
export function settingsPayload(draft: QuizDraft, isNew: boolean) {
  const attempts = integer(draft.maxAttempts);
  const duration = draft.durationMinutes.trim()
    ? integer(draft.durationMinutes)
    : 0;
  return {
    title: draft.title.trim(),
    slug: draft.slug || null,
    description: draft.description.trim() || null,
    ...(isNew && { scope: draft.scope, targetId: targetIdOf(draft) }),
    passingScore: integer(draft.passingScore),
    maxAttempts: attempts > 0 ? attempts : null,
    durationMinutes: duration > 0 ? duration : null,
    reviewPolicy: draft.reviewPolicy,
    isRequired: draft.scope === "STANDALONE" ? false : draft.isRequired,
    shuffleQuestions: draft.shuffleQuestions,
    shuffleOptions: draft.shuffleOptions,
    difficulty: draft.difficulty || null,
    tags: tagsOf(draft.tags),
  };
}

/** "JS, Basics,js" -> ["js", "basics"]: trimmed, lowercased, unique. */
export function tagsOf(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

const rubricTotal = (rubric?: RubricCriterion[]) =>
  rubric?.length
    ? rubric.reduce((total, { maxPoints }) => total + maxPoints, 0)
    : null;

/** essayConfig for the API; a rubric that no longer matches Max Points is omitted. */
function essayPayload(question: QuestionDraft) {
  const essay = question.essay ?? newEssay();
  const guide = essay.gradingGuide.trim();
  const rubric =
    rubricTotal(essay.rubric) === (integer(question.points) || 1)
      ? essay.rubric
      : undefined;
  return {
    allowedSubmissionTypes: essay.allowedSubmissionTypes,
    maxFileUploads: essay.maxFileUploads,
    ...(essay.maxWords !== undefined && { maxWords: essay.maxWords }),
    ...(guide && { gradingGuide: guide }),
    ...(rubric && { rubric }),
  };
}

export function questionPayload(question: QuestionDraft) {
  const common = {
    content: question.content.trim(),
    type: question.type,
    points: integer(question.points) || 1,
    explanation: question.explanation.trim() || null,
  };
  // An essay has no options: Max Points + grading guide instead.
  if (question.type === "ESSAY")
    return { ...common, essayConfig: essayPayload(question) };
  return {
    ...common,
    options: question.options.map((option) => ({
      content: option.content.trim(),
      isCorrect: option.isCorrect,
    })),
  };
}

function questionDraftFromApi(question: ApiQuestion): QuestionDraft {
  const config = question.essayConfig;
  return {
    key: question.id,
    id: question.id,
    type: question.type,
    content: question.content,
    points: String(question.points),
    explanation: question.explanation ?? "",
    ...(question.type === "ESSAY" && {
      essay: {
        gradingGuide: config?.gradingGuide ?? "",
        allowedSubmissionTypes:
          config?.allowedSubmissionTypes ?? newEssay().allowedSubmissionTypes,
        maxFileUploads: config?.maxFileUploads ?? 3,
        ...(config?.maxWords !== undefined && { maxWords: config.maxWords }),
        ...(config?.rubric && { rubric: config.rubric }),
      },
    }),
    options: [...question.options]
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        key: option.id,
        id: option.id,
        content: option.content,
        isCorrect: option.isCorrect,
      })),
  };
}

export function draftFromApi(
  quiz: ApiQuiz,
  path: { courseId: string; chapterId: string; lessonId: string },
): QuizDraft {
  return {
    title: quiz.title,
    slug: quiz.slug ?? "",
    description: quiz.description ?? "",
    scope: quiz.scope,
    ...path,
    passingScore: String(quiz.passingScore),
    maxAttempts: String(quiz.maxAttempts ?? 0),
    durationMinutes: String(quiz.durationMinutes ?? 0),
    reviewPolicy: quiz.reviewPolicy,
    isRequired: quiz.isRequired,
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleOptions: quiz.shuffleOptions,
    difficulty: quiz.difficulty ?? "",
    tags: (quiz.tags ?? []).join(", "),
    questions: [...quiz.questions]
      .sort((a, b) => a.position - b.position)
      .map(questionDraftFromApi),
  };
}

const sameQuestion = (draft: QuestionDraft, saved: ApiQuestion) =>
  JSON.stringify(questionPayload(draft)) ===
  JSON.stringify(questionPayload(questionDraftFromApi(saved)));

export type SyncPlan = {
  // Saved questions no longer in the form, or edited (replaced by a create).
  remove: string[];
  // Questions to create, by form key.
  create: QuestionDraft[];
  // Untouched saved questions kept as they are, by form key -> id.
  keep: Map<string, string>;
};

/**
 * How to bring the server's questions to the form's state. An edited
 * question is replaced (delete + create with its options): one rule that
 * also covers type and answer key changes, and draft question ids carry no
 * history (attempts read their own snapshot).
 */
export function planQuestionSync(
  form: QuestionDraft[],
  saved: ApiQuestion[],
): SyncPlan {
  const byId = new Map(saved.map((question) => [question.id, question]));
  const keep = new Map<string, string>();
  const create: QuestionDraft[] = [];
  for (const question of form) {
    const current = question.id ? byId.get(question.id) : undefined;
    if (current && sameQuestion(question, current))
      keep.set(question.key, current.id);
    else create.push(question);
  }
  const kept = new Set(keep.values());
  return {
    remove: saved
      .filter((question) => !kept.has(question.id))
      .map(({ id }) => id),
    create,
    keep,
  };
}

/** Maps the server's publish gate issues to readable messages. */
export const PUBLISH_ISSUE_LABEL: Record<string, string> = {
  QUIZ_HAS_NO_QUESTIONS: "Bài quiz chưa có câu hỏi nào.",
  QUESTION_MISSING_CORRECT_OPTION: "Có câu hỏi chưa có đáp án đúng.",
  QUESTION_NEEDS_TWO_OPTIONS: "Mỗi câu hỏi cần ít nhất 2 đáp án.",
  SINGLE_CHOICE_HAS_MULTIPLE_CORRECT:
    "Câu một lựa chọn chỉ được có 1 đáp án đúng.",
  MULTIPLE_CHOICE_NEEDS_INCORRECT_OPTION:
    "Câu nhiều lựa chọn cần ít nhất 1 đáp án sai.",
  INVALID_QUESTION_POINTS: "Điểm của câu hỏi phải ≥ 1.",
  STANDALONE_QUIZ_REQUIRES_SLUG: "Quiz độc lập cần có slug.",
  INVALID_PASSING_SCORE: "Điểm đạt không hợp lệ.",
  INVALID_MAX_ATTEMPTS: "Số lượt làm bài không hợp lệ.",
  INVALID_DURATION_MINUTES: "Thời gian làm bài không hợp lệ.",
  ESSAY_CONFIG_REQUIRED: "Có câu tự luận chưa cấu hình.",
  ESSAY_OPTIONS_NOT_ALLOWED: "Câu tự luận không được có đáp án.",
  REVIEW_POLICY_REQUIRES_MAX_ATTEMPTS:
    "Chính sách xem đáp án này cần giới hạn số lượt.",
};
