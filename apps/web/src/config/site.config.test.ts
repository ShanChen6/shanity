import { describe, expect, it } from "vitest";
import { resolveSocialLinks, safeExternalUrl } from "./site.config";

describe("safeExternalUrl", () => {
  it("accepts plain https URLs", () => {
    expect(safeExternalUrl("https://facebook.com/shanity")).toBe(
      "https://facebook.com/shanity",
    );
  });

  it.each([
    undefined,
    "",
    "javascript:alert(1)",
    "http://example.com",
    "data:text/html,x",
    "//example.com",
    "https://user:pass@example.com",
    "not a url",
  ])("rejects %s", (value) => {
    expect(safeExternalUrl(value)).toBeNull();
  });
});

describe("resolveSocialLinks", () => {
  it("drops unset and unsafe entries and keeps order", () => {
    expect(
      resolveSocialLinks([
        { id: "facebook", label: "Facebook", url: undefined },
        {
          id: "youtube",
          label: "YouTube",
          url: "https://youtube.com/@shanity",
        },
        { id: "tiktok", label: "TikTok", url: "javascript:void(0)" },
        { id: "github", label: "GitHub", url: "https://github.com/shanity" },
      ]),
    ).toEqual([
      { id: "youtube", label: "YouTube", href: "https://youtube.com/@shanity" },
      { id: "github", label: "GitHub", href: "https://github.com/shanity" },
    ]);
  });
});
