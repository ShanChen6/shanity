import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  draftFromApi,
  emptyDraft,
  newQuestion,
  planQuestionSync,
  publishIssues,
  questionPayload,
  withType,
  type ApiQuiz,
  type QuestionDraft,
} from "./model";
import { QuestionCard } from "./QuestionCard";

const essay = (patch: Partial<QuestionDraft> = {}): QuestionDraft => ({
  ...withType(newQuestion(), "ESSAY"),
  content: "Prove it",
  points: "10",
  ...patch,
});

function Harness() {
  const [question, setQuestion] = useState(newQuestion());
  return (
    <>
      <ul>
        <QuestionCard
          question={question}
          index={0}
          issues={[]}
          readOnly={false}
          canRemove
          onChange={setQuestion}
          onRemove={() => {}}
          onDuplicate={() => {}}
        />
      </ul>
      <output data-testid="payload">
        {JSON.stringify(questionPayload(question))}
      </output>
    </>
  );
}

describe("essay question authoring", () => {
  it("sends Max Points and the grading guide, and no options", () => {
    const payload = questionPayload({
      ...essay(),
      essay: { ...essay().essay!, gradingGuide: "  Award 5 for proof  " },
    });
    expect(payload).toEqual({
      content: "Prove it",
      type: "ESSAY",
      points: 10,
      explanation: null,
      essayConfig: {
        allowedSubmissionTypes: ["TEXT_WITH_KATEX", "FILE_UPLOAD"],
        maxFileUploads: 3,
        gradingGuide: "Award 5 for proof",
      },
    });
    expect(payload).not.toHaveProperty("options");
  });

  it("publishes an essay without options but checks points and rubric", () => {
    const draft = { ...emptyDraft(), title: "Quiz", slug: "q" };
    expect(
      publishIssues(
        { ...draft, scope: "STANDALONE", questions: [essay()] },
        true,
      ),
    ).toEqual([]);
    const mismatched = essay({
      essay: {
        ...essay().essay!,
        rubric: [{ criterion: "Proof", maxPoints: 4 }],
      },
    });
    expect(
      publishIssues(
        { ...draft, scope: "STANDALONE", questions: [mismatched] },
        true,
      ).map(({ message }) => message),
    ).toEqual(["Câu 1: tổng điểm rubric (4) phải bằng điểm tối đa."]);
  });

  it("round-trips a saved essay, keeping an untouched one in place", () => {
    const saved: ApiQuiz["questions"] = [
      {
        id: "e1",
        type: "ESSAY",
        content: "Prove it",
        position: 1,
        points: 10,
        explanation: null,
        essayConfig: {
          allowedSubmissionTypes: ["TEXT_WITH_KATEX"],
          maxFileUploads: 1,
          gradingGuide: "Guide",
          rubric: [{ criterion: "Proof", maxPoints: 10 }],
        },
        options: [],
      },
    ];
    const [draft] = saved.map(
      (question) =>
        draftFromApi({ questions: [question] } as unknown as ApiQuiz, {
          courseId: "",
          chapterId: "",
          lessonId: "",
        }).questions[0]!,
    );
    expect(draft!.essay?.gradingGuide).toBe("Guide");
    expect(planQuestionSync([draft!], saved).keep.get("e1")).toBe("e1");
    const edited = {
      ...draft!,
      essay: { ...draft!.essay!, gradingGuide: "Changed" },
    };
    expect(planQuestionSync([edited], saved).create).toHaveLength(1);
  });

  it("switches the form between options and Max Points / Grading Guide", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText("Nội dung đáp án 1")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Loại Câu 1"), "ESSAY");
    expect(screen.queryByLabelText("Nội dung đáp án 1")).toBeNull();
    expect(screen.getByLabelText("Điểm tối đa Câu 1")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/Đầy đủ 3 ý chính/),
      "Rubric text",
    );
    expect(screen.getByTestId("payload")).toHaveTextContent(
      '"gradingGuide":"Rubric text"',
    );

    await user.selectOptions(
      screen.getByLabelText("Loại Câu 1"),
      "MULTIPLE_CHOICE",
    );
    expect(screen.getByLabelText("Nội dung đáp án 1")).toBeInTheDocument();
  });
});
