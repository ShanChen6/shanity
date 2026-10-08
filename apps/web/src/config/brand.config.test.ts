import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toHex } from "@/test-utils/color";
import { readTokens, resolveToken } from "@/test-utils/color";
import { BRAND } from "./brand.config";

const publicDir = join(process.cwd(), "public");
const theme = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");

/** Width/height from a PNG's IHDR chunk, without any image dependency. */
function pngSize(file: string) {
  const buffer = readFileSync(join(publicDir, file));
  expect(buffer.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("brand assets", () => {
  it("ships every file the config points at", () => {
    const files = [
      BRAND.assets.fullLight.src,
      BRAND.assets.fullDark.src,
      BRAND.assets.icon.src,
      BRAND.assets.favicon,
      BRAND.assets.favicon16,
      BRAND.assets.favicon32,
      BRAND.assets.appleTouchIcon,
      BRAND.assets.androidChrome192,
      BRAND.assets.androidChrome512,
    ];
    for (const file of files)
      expect(existsSync(join(publicDir, file)), file).toBe(true);
  });

  it("declares the real pixel size of each logo, so aspect ratios are right", () => {
    for (const asset of [
      BRAND.assets.fullLight,
      BRAND.assets.fullDark,
      BRAND.assets.icon,
    ])
      expect(pngSize(asset.src), asset.src).toEqual({
        width: asset.width,
        height: asset.height,
      });
    expect(pngSize(BRAND.assets.androidChrome192)).toEqual({
      width: 192,
      height: 192,
    });
    expect(pngSize(BRAND.assets.androidChrome512)).toEqual({
      width: 512,
      height: 512,
    });
    expect(pngSize(BRAND.assets.appleTouchIcon)).toEqual({
      width: 180,
      height: 180,
    });
  });

  it("has no stale reference to the old assets/logo folder", () => {
    expect(existsSync(join(publicDir, "assets/logo"))).toBe(false);
  });
});

describe("brand theme colours", () => {
  it("match the page background in each theme", () => {
    const light = readTokens(theme, ":root");
    const dark = readTokens(theme, ".dark");
    expect(BRAND.themeColor.light).toBe(
      toHex(resolveToken("background", light)),
    );
    expect(BRAND.themeColor.dark).toBe(
      toHex(resolveToken("background", dark, light)),
    );
  });
});
