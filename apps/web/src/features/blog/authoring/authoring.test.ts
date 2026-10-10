import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { blogErrorMessage } from "./api";
import { permissionsFor } from "./status";
import type { BlogPostStatus } from "./types";

const post = (status: BlogPostStatus, authorId = "author") => ({
  status,
  author: { id: authorId, name: "Tác giả", avatarUrl: null },
});
const author = { id: "author", isAdmin: false };
const admin = { id: "admin", isAdmin: true };

describe("permissionsFor", () => {
  it("lets an author edit, delete and submit only their drafts", () => {
    expect(permissionsFor(post("DRAFT"), author)).toMatchObject({
      edit: true,
      remove: true,
      submit: true,
      withdraw: false,
      publish: false,
    });
    expect(permissionsFor(post("PENDING_REVIEW"), author)).toMatchObject({
      edit: false,
      submit: false,
      withdraw: true,
    });
    expect(permissionsFor(post("PUBLISHED"), author)).toMatchObject({
      edit: false,
      hide: false,
    });
  });

  it("gives an author nothing on someone else's post", () => {
    const others = permissionsFor(post("DRAFT", "someone"), author);
    expect(Object.values({ ...others, own: true }).filter(Boolean)).toEqual([true]);
  });

  it("lets admins review but not submit or withdraw for the author", () => {
    expect(permissionsFor(post("PENDING_REVIEW"), admin)).toMatchObject({
      own: false,
      edit: true,
      publish: true,
      reject: true,
      withdraw: false,
    });
    expect(permissionsFor(post("DRAFT"), admin)).toMatchObject({ submit: false, edit: true });
    expect(permissionsFor(post("PUBLISHED"), admin)).toMatchObject({ hide: true, publish: false });
    expect(permissionsFor(post("ARCHIVED"), admin)).toMatchObject({ edit: false });
  });
});

describe("blogErrorMessage", () => {
  it("names what an incomplete post is missing", () => {
    const error = new ApiError(422, ["BLOG_POST_INCOMPLETE"], {
      code: "BLOG_POST_INCOMPLETE",
      missing: ["content", "categoryId"],
    });
    expect(blogErrorMessage(error)).toBe(
      "Bài còn thiếu nội dung và chủ đề nên chưa thể gửi duyệt.",
    );
  });

  it("explains a taken slug", () => {
    const error = new ApiError(409, ["BLOG_SLUG_TAKEN"], { code: "BLOG_SLUG_TAKEN" });
    expect(blogErrorMessage(error)).toMatch(/slug/);
  });

  it("falls back to the generic message", () => {
    expect(blogErrorMessage(new Error("boom"))).toBe("Có lỗi xảy ra. Vui lòng thử lại.");
  });
});
