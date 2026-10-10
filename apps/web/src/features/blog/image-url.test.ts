import { describe, expect, it } from "vitest";
import { API_URL } from "@/lib/api";
import { blogImageUrl } from "./image-url";

const id = "0b9f8d3e-4c2a-4f1e-9a7b-2d6c5e4f3a21";

describe("blogImageUrl", () => {
  it("puts the current API origin in front of an uploaded image path", () => {
    expect(blogImageUrl(`/blog-images/${id}`)).toBe(`${API_URL}/blog-images/${id}`);
  });

  it("re-points absolute links to an uploaded image from an old domain", () => {
    expect(blogImageUrl(`http://localhost:4000/blog-images/${id}`)).toBe(
      `${API_URL}/blog-images/${id}`,
    );
    expect(blogImageUrl(`https://old-api.example.vn/blog-images/${id}`)).toBe(
      `${API_URL}/blog-images/${id}`,
    );
  });

  it("leaves other images as written", () => {
    expect(blogImageUrl("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(blogImageUrl("/blog-images/not-an-id")).toBe("/blog-images/not-an-id");
  });
});
