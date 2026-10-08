import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readTokens, resolveToken } from "@/test-utils/color";

const css = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
const light = readTokens(css, ":root");
const dark = readTokens(css, ".dark");

const themes = {
  light: (name: string) => resolveToken(name, light),
  // .dark overrides :root; anything it does not redefine falls through.
  dark: (name: string) => resolveToken(name, dark, light),
} as const;

/** WCAG 1.4.3: text (and its tint backgrounds) needs 4.5:1. */
const TEXT: ReadonlyArray<[string, string]> = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["foreground", "surface-secondary"],
  ["foreground", "surface-hover"],
  ["foreground-secondary", "background"],
  ["foreground-secondary", "surface"],
  ["foreground-secondary", "surface-secondary"],
  ["muted", "background"],
  ["muted", "surface"],
  ["muted", "surface-secondary"],
  ["muted", "surface-hover"],
  ["muted-foreground", "surface"],
  ["primary", "background"],
  ["primary", "surface"],
  ["primary", "surface-secondary"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["primary-foreground", "primary-active"],
  ["secondary-foreground", "secondary"],
  ["secondary-foreground", "secondary-hover"],
  ["accent-foreground", "accent"],
  ["success-foreground", "success-background"],
  ["warning-foreground", "warning-background"],
  ["danger-foreground", "danger-background"],
  ["info-foreground", "info-background"],
  ["success", "surface"],
  ["warning", "surface"],
  ["danger", "surface"],
  ["info", "surface"],
];

/**
 * WCAG 1.4.11: the edge of a form control or button, and the focus ring, need
 * 3:1 against whatever they sit on. Decorative --border dividers and disabled
 * text are exempt by the standard and deliberately not listed.
 */
const BOUNDARIES: ReadonlyArray<[string, string]> = [
  ["ring", "background"],
  ["ring", "surface"],
  ["border-strong", "background"],
  ["border-strong", "surface"],
  ["input", "background"],
  ["input", "surface"],
  ["input-hover", "surface"],
  ["primary", "surface"],
];

describe.each(Object.entries(themes))("%s theme contrast", (_name, color) => {
  it.each(TEXT)("text: %s on %s reaches 4.5:1", (foreground, background) => {
    expect(
      contrastRatio(color(foreground), color(background)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BOUNDARIES)(
    "boundary: %s on %s reaches 3:1",
    (foreground, background) => {
      expect(
        contrastRatio(color(foreground), color(background)),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it("makes a hovered field outline stand out more than a resting one", () => {
    const surface = color("surface");
    expect(contrastRatio(color("input-hover"), surface)).toBeGreaterThan(
      contrastRatio(color("input"), surface),
    );
  });
});

describe("focus styles", () => {
  it("draws a thick ring offset from the control on :focus-visible", () => {
    const base = readFileSync(
      join(process.cwd(), "src/styles/base.css"),
      "utf8",
    );
    expect(base).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--ring\)[^}]*outline-offset:\s*3px/,
    );
  });
});
