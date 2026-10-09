import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("combines conditional class names", () => {
    expect(cn("flex", false && "hidden", { "items-center": true })).toBe(
      "flex items-center",
    );
  });

  it("keeps the last conflicting Tailwind class", () => {
    expect(cn("px-4 bg-primary", "px-2 bg-surface")).toBe(
      "px-2 bg-surface",
    );
  });
});
