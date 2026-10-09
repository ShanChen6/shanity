import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  fileProblem,
  formatOf,
  importFailure,
  issueLocation,
  issueText,
} from "./api";
import { ImportLessonDialog } from "./ImportLessonDialog";
import { ImportQuizDialog } from "./ImportQuizDialog";

const API = "http://localhost:4000";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Sent = { path: string; form: FormData };
let sent: Sent[];
let reply: { status: number; body: unknown };

beforeEach(() => {
  sent = [];
  reply = { status: 201, body: {} };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace(API, "");
      if (init.body instanceof FormData) {
        sent.push({ path, form: init.body });
        return new Response(JSON.stringify(reply.body), {
          status: reply.status,
        });
      }
      return new Response("[]", { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const file = (name: string, content = "x", type = "") =>
  new File([content], name, { type });

describe("import helpers", () => {
  it("detects formats by extension and pre-checks files", () => {
    expect(formatOf(file("a.XLSX"))).toBe("xlsx");
    expect(formatOf(file("notes.md"))).toBe("markdown");
    expect(formatOf(file("md"))).toBeNull();
    expect(fileProblem(file("a.csv"), ["xlsx"])).toMatch(/Chỉ hỗ trợ/);
    expect(fileProblem(file("a.md", ""), ["markdown"])).toBe(
      "File đang trống.",
    );
    expect(
      fileProblem(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.json"), [
        "json",
      ]),
    ).toMatch(/5 MB/);
    expect(fileProblem(file("a.json"), ["json"])).toBeNull();
  });

  it("turns a 422 into a summary plus located issues", () => {
    const failure = importFailure(
      new ApiError(422, ["IMPORT_VALIDATION_FAILED"], {
        code: "IMPORT_VALIDATION_FAILED",
        errors: [
          {
            row: 5,
            column: "D",
            message: "Row 5, Column D: Missing correct answer index",
          },
        ],
        totalErrors: 1,
      }),
    );
    expect(failure.message).toBe(
      "File có 1 lỗi cần sửa. Không có gì được lưu.",
    );
    expect(issueLocation(failure.issues[0]!)).toBe("Dòng 5 · Cột D");
    expect(issueText(failure.issues[0]!)).toBe("Missing correct answer index");
    expect(
      importFailure(
        new ApiError(413, ["x"], {
          code: "IMPORT_FILE_TOO_LARGE_UNCOMPRESSED",
        }),
      ).message,
    ).toMatch(/giải nén/);
  });
});

describe("ImportQuizDialog", () => {
  it("requires a title for Excel files, then uploads with the canonical MIME type", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    reply = {
      status: 201,
      body: { id: "z1", import: { format: "xlsx", questionCount: 3 } },
    };
    render(<ImportQuizDialog onImported={onImported} onClose={vi.fn()} />, {
      wrapper,
    });

    await user.upload(
      screen.getByLabelText("Chọn file import"),
      file("questions.xlsx", "PK", ""),
    );
    await user.click(screen.getByRole("button", { name: "Import quiz" }));
    expect(
      await screen.findByText("Nhập tiêu đề quiz (ít nhất 3 ký tự)."),
    ).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await user.type(screen.getByLabelText(/Tiêu đề/), "Kiểm tra JS");
    await user.click(screen.getByRole("button", { name: "Import quiz" }));
    await waitFor(() => expect(onImported).toHaveBeenCalled());

    const [{ path, form }] = sent;
    expect(path).toBe("/api/v1/instructor/import/quiz");
    expect(form.get("title")).toBe("Kiểm tra JS");
    expect(form.get("scope")).toBe("STANDALONE");
    expect(form.get("slug")).toBe("kiem-tra-js");
    expect((form.get("file") as File).type).toBe(XLSX);
  });

  it("sends no settings for JSON unless the author overrides them", async () => {
    const user = userEvent.setup();
    reply = { status: 201, body: { id: "z2" } };
    render(<ImportQuizDialog onImported={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    await user.upload(
      screen.getByLabelText("Chọn file import"),
      file("quiz.json", "{}"),
    );
    expect(screen.queryByLabelText(/Tiêu đề/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import quiz" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect([...sent[0]!.form.keys()]).toEqual(["file"]);
    expect((sent[0]!.form.get("file") as File).type).toBe("application/json");
  });

  it("lists every located problem from a 422", async () => {
    const user = userEvent.setup();
    reply = {
      status: 422,
      body: {
        statusCode: 422,
        code: "IMPORT_VALIDATION_FAILED",
        errors: [
          {
            row: 5,
            column: "D",
            message: "Row 5, Column D: Missing correct answer index",
          },
          {
            row: 6,
            column: "E-H",
            message: "Row 6, Column E-H: At least 2 options are required",
          },
        ],
        totalErrors: 2,
      },
    };
    render(<ImportQuizDialog onImported={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    await user.upload(
      screen.getByLabelText("Chọn file import"),
      file("quiz.xlsx", "PK"),
    );
    await user.type(screen.getByLabelText(/Tiêu đề/), "Quiz lỗi");
    await user.click(screen.getByRole("button", { name: "Import quiz" }));

    const list = await screen.findByRole("list", {
      name: "Danh sách lỗi trong file",
    });
    expect(list).toHaveTextContent("Dòng 5 · Cột D");
    expect(list).toHaveTextContent("Missing correct answer index");
    expect(list).toHaveTextContent("Dòng 6 · Cột E-H");
    expect(
      screen.getByText("File có 2 lỗi cần sửa. Không có gì được lưu."),
    ).toBeInTheDocument();
  });

  it("rejects unsupported files before uploading", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<ImportQuizDialog onImported={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    await user.upload(
      screen.getByLabelText("Chọn file import"),
      file("quiz.csv", "a,b"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Chỉ hỗ trợ");
    expect(screen.getByRole("button", { name: "Import quiz" })).toBeDisabled();
  });
});

describe("ImportLessonDialog", () => {
  it("uploads a Markdown lesson to the chapter and reports it", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    const onClose = vi.fn();
    reply = {
      status: 201,
      body: { id: "l9", title: "Closures", isPublished: false },
    };
    render(
      <ImportLessonDialog
        chapterId="ch1"
        onImported={onImported}
        onClose={onClose}
      />,
      { wrapper },
    );
    await user.upload(
      screen.getByLabelText("Chọn file import"),
      file("closures.md", "# Closures"),
    );
    await user.click(screen.getByRole("button", { name: "Import bài học" }));

    await waitFor(() =>
      expect(onImported).toHaveBeenCalledWith(
        expect.objectContaining({ id: "l9" }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
    const [{ path, form }] = sent;
    expect(path).toBe("/api/v1/instructor/import/lesson");
    expect(form.get("chapterId")).toBe("ch1");
    expect(form.get("title")).toBeNull();
    expect((form.get("file") as File).type).toBe("text/markdown");
  });
});
