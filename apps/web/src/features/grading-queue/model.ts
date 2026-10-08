// Pure helpers of the instructor grading queue. No React, no fetch.

export type QueueStatus = "ALL" | "NEEDS_GRADING" | "GRADED";

// GET /instructor/grading-queue
export type GradingQueueItem = {
  attemptId: string;
  student: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
  course: { id: string; title: string; slug: string | null } | null;
  quiz: { id: string; title: string };
  submittedAt: string | null;
  totalEssays: number;
  pendingEssaysCount: number;
  // GRADED: graded but private; COMPLETED: published to the learner.
  status: "NEEDS_GRADING" | "GRADED" | "COMPLETED";
  publishedAt: string | null;
};
export type GradingQueuePage = {
  items: GradingQueueItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export const STATUS_TABS: ReadonlyArray<{ value: QueueStatus; label: string }> =
  [
    { value: "ALL", label: "Tất cả" },
    { value: "NEEDS_GRADING", label: "Cần chấm" },
    { value: "GRADED", label: "Đã chấm" },
  ];

export type QueueFilters = {
  courseId: string;
  quizId: string;
  status: QueueStatus;
  search: string;
  page: number;
};

/** Query string for the API; `ALL` and empty filters are omitted. */
export function queueQuery(filters: QueueFilters, limit = 20): string {
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: String(limit),
  });
  if (filters.courseId) query.set("courseId", filters.courseId);
  if (filters.quizId) query.set("quizId", filters.quizId);
  if (filters.status !== "ALL") query.set("status", filters.status);
  if (filters.search.trim()) query.set("search", filters.search.trim());
  return query.toString();
}

export type StatusBadge = {
  tone: "warning" | "neutral" | "success";
  label: string;
};

/** What the badge says: pending essays, graded-but-private, or published. */
export function statusBadge(item: GradingQueueItem): StatusBadge {
  if (item.status === "COMPLETED") return { tone: "success", label: "PUBLISHED" };
  if (item.status === "GRADED")
    return { tone: "neutral", label: "GRADED (Unpublished)" };
  return { tone: "warning", label: pendingLabel(item) };
}

/** "2 essays pending" / "1 essay pending" / "Graded". */
export function pendingLabel(item: GradingQueueItem): string {
  if (item.pendingEssaysCount === 0) return "Graded";
  return `${item.pendingEssaysCount} ${
    item.pendingEssaysCount === 1 ? "essay" : "essays"
  } pending`;
}

export type QuizGroup = {
  key: string;
  quizTitle: string;
  courseTitle: string | null;
  pending: number;
  // Graded attempts whose result is still private.
  unpublished: number;
  items: GradingQueueItem[];
};

/** Groups rows by quiz, keeping the server's order (pending work first). */
export function groupByQuiz(items: GradingQueueItem[]): QuizGroup[] {
  const groups = new Map<string, QuizGroup>();
  for (const item of items) {
    const group = groups.get(item.quiz.id) ?? {
      key: item.quiz.id,
      quizTitle: item.quiz.title,
      courseTitle: item.course?.title ?? null,
      pending: 0,
      unpublished: 0,
      items: [],
    };
    group.items.push(item);
    group.pending += item.pendingEssaysCount;
    if (item.status === "GRADED") group.unpublished += 1;
    groups.set(item.quiz.id, group);
  }
  return [...groups.values()];
}

export const gradingHref = (attemptId: string) =>
  `/instructor/grading/attempts/${attemptId}`;

// ---- Grading workspace (E12) ----

export type RubricCriterion = {
  criterion: string;
  maxPoints: number;
  description?: string;
};
export type EssayAttachment = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
};
export type EssayGrading =
  | { status: "UNGRADED"; awardedPoints: null }
  | {
      status: "GRADED";
      awardedPoints: number;
      rubricScores: Array<{ criterionIndex: number; score: number }>;
      feedback: string;
      gradedAt: string;
    };
export type EssayQuestionView = {
  id: string;
  type: "ESSAY";
  content: string;
  points: number;
  maxWords: number | null;
  gradingGuide: string | null;
  rubric: RubricCriterion[] | null;
  essayAnswer: { text?: string; attachments?: EssayAttachment[] } | null;
  grading: EssayGrading | null;
};
export type ObjectiveQuestionView = {
  id: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  content: string;
  points: number;
  isCorrect: boolean;
  pointsEarned: number;
};
// GET /instructor/quiz-attempts/:attemptId
export type GradingAttempt = {
  attemptId: string;
  status: string;
  publishedAt: string | null;
  submittedAt: string | null;
  student: { id: string; fullName: string; email: string };
  quiz: { id: string; title: string };
  course: { id: string; title: string; slug: string | null } | null;
  totalEssays: number;
  pendingEssaysCount: number;
  questions: Array<EssayQuestionView | ObjectiveQuestionView>;
};
// POST /instructor/quiz-attempts/:attemptId/grade
export type GradeResult = {
  attemptId: string;
  status: "NEEDS_GRADING" | "GRADED";
  remainingUngradedCount: number;
  result: {
    earnedPoints: number;
    totalPoints: number;
    percentage: number;
    score: number;
    isPassed: boolean;
  } | null;
};

export const essaysOf = (attempt: GradingAttempt) =>
  attempt.questions.filter(
    (question): question is EssayQuestionView => question.type === "ESSAY",
  );

// Numbers stay strings while typed.
export type GradeInput = { points: string; feedback: string; rubric: string[] };

/** The form's starting point: whatever grade is already saved. */
export function initialInputs(
  attempt: GradingAttempt,
): Record<string, GradeInput> {
  return Object.fromEntries(
    essaysOf(attempt).map((question) => {
      const grading = question.grading;
      const saved = grading?.status === "GRADED" ? grading : null;
      return [
        question.id,
        {
          points: saved ? String(saved.awardedPoints) : "",
          feedback: saved?.feedback ?? "",
          rubric: (question.rubric ?? []).map((_, index) => {
            const score = saved?.rubricScores.find(
              ({ criterionIndex }) => criterionIndex === index,
            );
            return score ? String(score.score) : "";
          }),
        },
      ];
    }),
  );
}

const number = (value: string) =>
  value.trim() === "" ? null : Number(value.trim());

/** Points to award: the rubric total when the question has a rubric. */
export function awardedOf(
  question: EssayQuestionView,
  input: GradeInput,
): number | null {
  if (!question.rubric?.length) return number(input.points);
  if (input.rubric.every((value) => value.trim() === "")) return null;
  return input.rubric.reduce((sum, value) => sum + (number(value) ?? 0), 0);
}

/** Client-side hint only; the server re-checks everything. */
export function gradeIssue(
  question: EssayQuestionView,
  input: GradeInput,
): string | null {
  const awarded = awardedOf(question, input);
  if (awarded === null) return null;
  if (!Number.isFinite(awarded) || awarded < 0)
    return "Điểm không được âm.";
  if (awarded > question.points)
    return `Điểm tối đa của câu này là ${question.points}.`;
  if (!Number.isInteger(awarded)) return "Điểm phải là số nguyên.";
  if (question.rubric?.length)
    for (const [index, criterion] of question.rubric.entries()) {
      const score = number(input.rubric[index] ?? "") ?? 0;
      if (score < 0 || score > criterion.maxPoints)
        return `“${criterion.criterion}” tối đa ${criterion.maxPoints} điểm.`;
    }
  return null;
}

/** The request body: only the questions the grader filled in. */
export function gradesPayload(
  attempt: GradingAttempt,
  inputs: Record<string, GradeInput>,
) {
  return essaysOf(attempt).flatMap((question) => {
    const input = inputs[question.id];
    const awarded = input ? awardedOf(question, input) : null;
    if (!input || awarded === null) return [];
    const rubricScores = question.rubric?.length
      ? input.rubric.flatMap((value, criterionIndex) =>
          value.trim() === ""
            ? []
            : [{ criterionIndex, score: Number(value) }],
        )
      : undefined;
    return [
      {
        questionId: question.id,
        awardedPoints: awarded,
        ...(input.feedback.trim() && { feedback: input.feedback.trim() }),
        ...(rubricScores?.length && { rubricScores }),
      },
    ];
  });
}

export type GradesPayload = ReturnType<typeof gradesPayload>;
