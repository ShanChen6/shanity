import { pageEnvelope } from "@/test-utils/envelope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyDraft,
  markCorrect,
  newQuestion,
  planQuestionSync,
  publishIssues,
  settingsPayload,
  withCourse,
  withScope,
  withType,
  type ApiQuestion,
} from "./model";
import { QuizBuilder } from "./QuizBuilder";

const API = "http://localhost:4000";

describe("quiz builder model", () => {
  it("drops selections the new scope cannot use and never requires STANDALONE", () => {
    const draft = {
      ...emptyDraft(),
      courseId: "c1",
      chapterId: "ch1",
      lessonId: "l1",
      isRequired: true,
    };
    expect(withScope(draft, "CHAPTER")).toMatchObject({
      courseId: "c1",
      chapterId: "ch1",
      lessonId: "",
    });
    expect(withScope(draft, "COURSE")).toMatchObject({
      courseId: "c1",
      chapterId: "",
      lessonId: "",
    });
    expect(withScope(draft, "STANDALONE")).toMatchObject({
      courseId: "",
      chapterId: "",
      lessonId: "",
      isRequired: false,
    });
    expect(withCourse(draft, "c2")).toMatchObject({
      courseId: "c2",
      chapterId: "",
      lessonId: "",
    });
  });

  it("keeps exactly one correct option on single choice", () => {
    const question = { ...newQuestion(), type: "MULTIPLE_CHOICE" as const };
    const [a, b] = question.options;
    const both = markCorrect(markCorrect(question, b!.key, true), a!.key, true);
    expect(both.options.map((option) => option.isCorrect)).toEqual([
      true,
      true,
    ]);
    expect(
      withType(both, "SINGLE_CHOICE").options.map((option) => option.isCorrect),
    ).toEqual([true, false]);
    const single = withType(both, "SINGLE_CHOICE");
    expect(
      markCorrect(single, b!.key, true).options.map(
        (option) => option.isCorrect,
      ),
    ).toEqual([false, true]);
  });

  it("checks the publish rules before calling the server", () => {
    const draft = { ...emptyDraft(), title: "Quiz" };
    expect(publishIssues(draft, true).map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        "Chọn khóa học, chương và bài học.",
        "Câu 1: nhập nội dung câu hỏi.",
        "Câu 1: có đáp án đang để trống.",
      ]),
    );
    const noCorrect = {
      ...draft,
      scope: "STANDALONE" as const,
      slug: "quiz",
      questions: [
        {
          ...newQuestion(),
          content: "Q",
          options: [
            { key: "a", content: "A", isCorrect: false },
            { key: "b", content: "B", isCorrect: false },
          ],
        },
      ],
    };
    expect(publishIssues(noCorrect, true)).toEqual([
      {
        field: `question:${noCorrect.questions[0]!.key}`,
        message: "Câu 1: đánh dấu ít nhất 1 đáp án đúng.",
      },
    ]);
    expect(publishIssues({ ...noCorrect, questions: [] }, true)).toEqual([
      { field: "questions", message: "Cần ít nhất 1 câu hỏi." },
    ]);
  });

  it("maps 0 attempts and 0 minutes to unlimited", () => {
    const payload = settingsPayload(
      {
        ...emptyDraft(),
        title: " T ",
        maxAttempts: "0",
        durationMinutes: "0",
        scope: "COURSE",
        courseId: "c1",
      },
      true,
    );
    expect(payload).toMatchObject({
      title: "T",
      scope: "COURSE",
      targetId: "c1",
      maxAttempts: null,
      durationMinutes: null,
      passingScore: 80,
    });
    expect(settingsPayload(emptyDraft(), false)).not.toHaveProperty("scope");
  });

  it("keeps untouched questions and replaces edited or removed ones", () => {
    const saved: ApiQuestion[] = ["q1", "q2", "q3"].map((id, index) => ({
      id,
      type: "SINGLE_CHOICE",
      content: id,
      position: index + 1,
      points: 1,
      explanation: null,
      options: [
        { id: `${id}a`, content: "A", position: 1, isCorrect: true },
        { id: `${id}b`, content: "B", position: 2, isCorrect: false },
      ],
    }));
    const toDraft = (question: ApiQuestion) => ({
      key: question.id,
      id: question.id,
      type: question.type,
      content: question.content,
      points: String(question.points),
      explanation: "",
      options: question.options.map((option) => ({
        key: option.id,
        id: option.id,
        content: option.content,
        isCorrect: option.isCorrect,
      })),
    });
    const fresh = { ...newQuestion(), content: "new" };
    const edited = { ...toDraft(saved[1]!), content: "changed" };
    const plan = planQuestionSync([toDraft(saved[0]!), edited, fresh], saved);
    expect([...plan.keep.entries()]).toEqual([["q1", "q1"]]);
    expect(plan.create.map(({ content }) => content)).toEqual([
      "changed",
      "new",
    ]);
    expect(plan.remove.sort()).toEqual(["q2", "q3"]);
  });
});

type Call = { method: string; path: string; body: unknown };
let calls: Call[];
let publishStatus = 200;

function installBackend() {
  let quiz: Record<string, unknown> | null = null;
  let questions: ApiQuestion[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace(API, "");
      const method = init.method ?? "GET";
      const body =
        typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, body });
      const reply = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status });
      const view = () => ({ ...quiz, attemptCount: 0, questions });
      if (path === "/api/v1/instructor/courses" && method === "GET")
        return reply([
          { id: "c1", title: "TypeScript", status: "published" },
          { id: "c2", title: "Go", status: "draft" },
        ]);
      if (path === "/api/v1/instructor/courses/c1/chapters")
        return reply([{ id: "ch1", title: "Basics", position: 0 }]);
      if (path === "/api/v1/instructor/courses/c1/lessons")
        return reply([
          { id: "l1", chapterId: "ch1", title: "Intro", position: 0 },
        ]);
      if (path === "/api/v1/instructor/quizzes" && method === "POST") {
        quiz = {
          id: "z1",
          status: "DRAFT",
          version: 1,
          courseId: "c1",
          ...body,
        };
        return reply(view(), 201);
      }
      if (
        path === "/api/v1/instructor/quizzes/z1/questions" &&
        method === "POST"
      ) {
        const id = `q${questions.length + 1}`;
        questions = [
          ...questions,
          {
            id,
            type: body.type,
            content: body.content,
            position: questions.length + 1,
            points: body.points,
            explanation: body.explanation,
            options: body.options.map(
              (
                option: { content: string; isCorrect: boolean },
                index: number,
              ) => ({
                id: `${id}o${index}`,
                position: index + 1,
                ...option,
              }),
            ),
          },
        ];
        return reply(questions.at(-1), 201);
      }
      if (path === "/api/v1/instructor/quizzes/z1/publish") {
        if (publishStatus === 422)
          return reply(
            {
              code: "QUIZ_NOT_PUBLISHABLE",
              issues: [{ code: "QUESTION_NEEDS_TWO_OPTIONS" }],
            },
            422,
          );
        quiz = { ...quiz, status: "PUBLISHED" };
        return reply({ id: "z1", version: 1, status: "PUBLISHED" });
      }
      if (path === "/api/v1/instructor/quizzes/z1" && method === "GET")
        return reply(view());
      if (path.startsWith("/api/v1/instructor/quizzes?"))
        return reply(pageEnvelope([]));
      return reply({ message: "not found" }, 404);
    }),
  );
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  calls = [];
  publishStatus = 200;
  installBackend();
  vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderBuilder = () => render(<QuizBuilder />, { wrapper: wrapper() });

describe("quiz builder form", () => {
  it("shows the target cascade that matches each scope", async () => {
    const user = userEvent.setup();
    renderBuilder();
    // LESSON by default: course -> chapter -> lesson.
    expect(
      screen.getByRole("combobox", { name: "Khóa học" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Chương" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Bài học" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Khóa học/ }));
    expect(
      screen.getByRole("combobox", { name: "Khóa học" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Chương" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Chương/ }));
    expect(
      screen.getByRole("combobox", { name: "Chương" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Bài học" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Độc lập/ }));
    expect(
      screen.queryByRole("combobox", { name: "Khóa học" }),
    ).not.toBeInTheDocument();
    // A standalone quiz can never be required.
    expect(screen.getByRole("switch", { name: /Bắt buộc/ })).toBeDisabled();
  });

  it("cascades course -> chapter -> lesson selections", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const course = screen.getByRole("combobox", { name: "Khóa học" });
    await waitFor(() =>
      expect(
        within(course).getByRole("option", { name: "TypeScript" }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(course, "c1");
    const chapter = screen.getByRole("combobox", { name: "Chương" });
    await waitFor(() => expect(chapter).toBeEnabled());
    await user.selectOptions(chapter, "ch1");
    const lesson = screen.getByRole("combobox", { name: "Bài học" });
    await waitFor(() =>
      expect(
        within(lesson).getByRole("option", { name: "Intro" }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(lesson, "l1");
    // Changing the course clears the dependent picks.
    await user.selectOptions(course, "c2");
    expect(screen.getByRole("combobox", { name: "Chương" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Bài học" })).toHaveValue("");
  });

  it("blocks publishing until the business rules hold, without calling the server", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.type(screen.getByRole("textbox", { name: "Tiêu đề" }), "Quiz");
    await user.click(screen.getByRole("button", { name: /Xuất bản/ }));
    expect(
      await screen.findByText("Câu 1: nhập nội dung câu hỏi."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chọn khóa học, chương và bài học."),
    ).toBeInTheDocument();
    expect(calls.filter(({ method }) => method !== "GET")).toEqual([]);
  });

  it("uses radios for single choice and checkboxes for multiple choice", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const card = screen.getByRole("listitem", { name: "Câu 1" });
    expect(within(card).getAllByRole("radio")).toHaveLength(2);
    await user.selectOptions(
      within(card).getByRole("combobox", { name: "Loại Câu 1" }),
      "MULTIPLE_CHOICE",
    );
    expect(within(card).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("creates, adds questions and publishes in order, with a toast", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.type(screen.getByRole("textbox", { name: "Tiêu đề" }), "Quiz");
    await user.click(screen.getByRole("radio", { name: /Khóa học/ }));
    const course = screen.getByRole("combobox", { name: "Khóa học" });
    await waitFor(() =>
      expect(
        within(course).getByRole("option", { name: "TypeScript" }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(course, "c1");
    const card = screen.getByRole("listitem", { name: "Câu 1" });
    await user.type(
      within(card).getByRole("textbox", { name: "Nội dung câu hỏi" }),
      "TypeScript là gì?",
    );
    await user.type(
      within(card).getByRole("textbox", { name: "Nội dung đáp án 1" }),
      "Superset của JS",
    );
    await user.type(
      within(card).getByRole("textbox", { name: "Nội dung đáp án 2" }),
      "Framework CSS",
    );

    await user.click(screen.getByRole("button", { name: /Xuất bản/ }));
    expect(
      await screen.findByText("Đã xuất bản phiên bản 1."),
    ).toBeInTheDocument();
    expect(
      calls
        .filter(({ method }) => method !== "GET")
        .map(({ method, path }) => `${method} ${path}`),
    ).toEqual([
      "POST /api/v1/instructor/quizzes",
      "POST /api/v1/instructor/quizzes/z1/questions",
      "POST /api/v1/instructor/quizzes/z1/publish",
    ]);
    expect(
      calls.find(
        ({ path, method }) =>
          method === "POST" && path === "/api/v1/instructor/quizzes",
      )!.body,
    ).toMatchObject({
      title: "Quiz",
      scope: "COURSE",
      targetId: "c1",
      isRequired: false,
      passingScore: 80,
      maxAttempts: null,
      durationMinutes: 15,
      reviewPolicy: "AFTER_SUBMIT",
    });
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/instructor/quizzes/z1/edit",
    );
    // Published: read-only, with the new-version action instead.
    expect(
      await screen.findByRole("button", { name: /Tạo phiên bản mới/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Tiêu đề" })).toBeDisabled();
  });

  it("shows the server's publish gate issues", async () => {
    publishStatus = 422;
    const user = userEvent.setup();
    renderBuilder();
    await user.type(screen.getByRole("textbox", { name: "Tiêu đề" }), "Quiz");
    await user.click(screen.getByRole("radio", { name: /Khóa học/ }));
    const course = screen.getByRole("combobox", { name: "Khóa học" });
    await waitFor(() =>
      expect(
        within(course).getByRole("option", { name: "TypeScript" }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(course, "c1");
    const card = screen.getByRole("listitem", { name: "Câu 1" });
    await user.type(
      within(card).getByRole("textbox", { name: "Nội dung câu hỏi" }),
      "Q",
    );
    await user.type(
      within(card).getByRole("textbox", { name: "Nội dung đáp án 1" }),
      "A",
    );
    await user.type(
      within(card).getByRole("textbox", { name: "Nội dung đáp án 2" }),
      "B",
    );
    await user.click(screen.getByRole("button", { name: /Xuất bản/ }));
    expect(
      await screen.findByText("Mỗi câu hỏi cần ít nhất 2 đáp án."),
    ).toBeInTheDocument();
  });
});
