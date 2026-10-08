"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// GET /courses/:courseId/quizzes (enrolled learners and course staff).
export type QuizStepStatus =
  "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED";
export type CourseQuiz = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  scope: "LESSON" | "CHAPTER" | "COURSE";
  targetId: string;
  isRequired: boolean;
  passingScore: number;
  durationMinutes: number | null;
  maxAttempts: number | null;
  totalQuestions: number;
  totalPoints: number;
  reviewPolicy: string;
  attemptsUsed: number;
  attemptsRemaining: number | null;
  hasActiveAttempt: boolean;
  isPassed: boolean;
  status: QuizStepStatus;
  stepCompleted: boolean;
  latestAttemptId: string | null;
};

// POST /quizzes/:id/attempts and GET /quizzes/:id/active-attempt.
export type EssaySubmissionType = "TEXT_WITH_KATEX" | "FILE_UPLOAD";
export type EssayAttachment = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
};
export type EssayAnswerValue = {
  text?: string;
  attachments?: EssayAttachment[];
};
export type AttemptQuestion = {
  id: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "ESSAY";
  // Essay only; the grading guide is never sent to learners.
  essayConfig?: {
    allowedSubmissionTypes: EssaySubmissionType[];
    maxFileUploads: number;
    maxWords?: number;
  };
  content: string;
  position: number;
  points: number;
  options: Array<{ id: string; content: string; position: number }>;
};
export type SavedAnswer = {
  questionId: string;
  selectedOptionId: string | null;
  selectedOptionIds: string[];
  essayAnswer?: EssayAnswerValue | null;
  savedAt: string;
};
export type AttemptStatus =
  | "IN_PROGRESS"
  | "SUBMITTING"
  | "SUBMITTED"
  | "NEEDS_GRADING"
  | "COMPLETED"
  | "TIMED_OUT"
  | "ABANDONED";
export type Attempt = {
  id: string;
  quizId: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  score: number | null;
  isPassed: boolean | null;
  percentage: number | null;
  notice?: "ATTEMPT_TIMED_OUT";
  serverNow: string;
  quiz?: {
    title: string;
    description: string | null;
    durationMinutes: number | null;
    passingScore: number;
    questions: AttemptQuestion[];
  };
  answers?: SavedAnswer[];
};

// GET /quiz-attempts/:attemptId/result.
export type AttemptResult = {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  status: AttemptStatus;
  notice?: "ATTEMPT_TIMED_OUT";
  // Null (and `message` set) while essays await the instructor's grading.
  scoreVisible: boolean;
  message?: string;
  score: {
    earnedPoints: number;
    totalPoints: number;
    percentage: number;
    passingScore: number;
    passed: boolean;
  } | null;
  attemptInfo: {
    currentAttempt: number;
    maxAttempts: number | null;
    startedAt: string;
    submittedAt: string | null;
  };
  reviewPolicy: string;
  reviewAllowed: boolean;
  questions: Array<{
    id: string;
    type: AttemptQuestion["type"];
    content: string;
    points: number;
    selectedOptionId: string | null;
    selectedOptionIds: string[];
    isCorrect: boolean | null;
    pointsEarned: number | null;
    explanation: string | null;
    options: Array<{ id: string; content: string; isCorrect?: boolean }>;
  }>;
};

export const courseQuizzesKey = (courseId: string, userId?: string) => [
  "learn",
  "course-quizzes",
  courseId,
  userId,
];

export function useCourseQuizzes(
  courseId: string,
  userId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: courseQuizzesKey(courseId, userId),
    queryFn: ({ signal }) =>
      api<{ quizzes: CourseQuiz[] }>(`/courses/${courseId}/quizzes`, {
        signal,
      }).then(({ quizzes }) => quizzes),
    enabled,
    retry: false,
  });
}

export const resultKey = (attemptId: string) => [
  "learn",
  "quiz-result",
  attemptId,
];

export function useAttemptResult(attemptId: string | null) {
  return useQuery({
    queryKey: resultKey(attemptId ?? ""),
    queryFn: ({ signal }) =>
      api<AttemptResult>(`/quiz-attempts/${attemptId}/result`, { signal }),
    enabled: Boolean(attemptId),
    retry: false,
  });
}

const post = (path: string, body?: unknown) =>
  api<Attempt>(path, {
    method: body === undefined ? "POST" : "PUT",
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

/** Starts a new attempt or resumes the running one (same endpoint). */
export const startAttempt = (quizId: string) =>
  post(`/quizzes/${quizId}/attempts`);

export const saveAnswer = (
  attemptId: string,
  questionId: string,
  selectedOptionIds: string[],
) =>
  api<SavedAnswer>(`/quiz-attempts/${attemptId}/answers`, {
    method: "PUT",
    body: JSON.stringify({ questionId, selectedOptionIds }),
  });

/**
 * Draft autosave (PATCH): an essay (`{}` clears it) or an option selection.
 * Never grades; the attempt stays IN_PROGRESS.
 */
export const saveDraft = (
  attemptId: string,
  questionId: string,
  answer: { essayAnswer: EssayAnswerValue } | { selectedOptionIds: string[] },
) =>
  api<SavedAnswer>(`/quiz-attempts/${attemptId}/answers/draft`, {
    method: "PATCH",
    body: JSON.stringify({ questionId, ...answer }),
  });

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Uploads a draft photo/PDF straight to Cloudinary with parameters signed by
 * the API, and returns the attachment to store in the essay answer.
 */
export async function uploadEssayAttachment(
  attemptId: string,
  file: File,
): Promise<EssayAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new Error("Tệp tối đa 10 MB.");
  const signed = await api<{
    uploadUrl: string;
    apiKey: string;
    timestamp: number;
    folder: string;
    signature: string;
  }>(`/quiz-attempts/${attemptId}/attachments/signature`, { method: "POST" });
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", signed.apiKey);
  form.set("timestamp", String(signed.timestamp));
  form.set("folder", signed.folder);
  form.set("signature", signed.signature);
  const response = await fetch(signed.uploadUrl, {
    method: "POST",
    body: form,
  }).catch(() => {
    throw new Error(
      "Không kết nối được tới Cloudinary (mạng hoặc trình duyệt chặn).",
    );
  });
  const result = (await response.json().catch(() => ({}))) as {
    secure_url?: string;
    bytes?: number;
    error?: { message?: string };
  };
  if (!response.ok || !result.secure_url)
    throw new Error(result.error?.message ?? "Tải lên thất bại.");
  return {
    url: result.secure_url,
    filename: file.name.slice(0, 255),
    mimeType: file.type || "application/octet-stream",
    size: Math.max(1, result.bytes ?? file.size),
  };
}

export const submitAttempt = (attemptId: string) =>
  post(`/quiz-attempts/${attemptId}/submit`);
