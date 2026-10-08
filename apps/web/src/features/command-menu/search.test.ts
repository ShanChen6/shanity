import { describe, expect, it } from "vitest";
import { normalize, rank, scoreMatch } from "./search";

describe("normalize", () => {
  it("strips Vietnamese diacritics, including đ", () => {
    expect(normalize("Khóa học của Đạt")).toBe("khoa hoc cua dat");
    expect(normalize("  ĐƠN HÀNG ")).toBe("don hang");
  });
});

describe("scoreMatch", () => {
  const item = { label: "Khóa học của tôi", keywords: ["giáo trình"] };

  it("ranks exact > prefix > word-prefix > substring > keyword", () => {
    const scores = [
      scoreMatch("khóa học của tôi", item),
      scoreMatch("khoa", item),
      scoreMatch("toi", item),
      scoreMatch("oc cua", item),
      scoreMatch("giao trinh", item),
    ];
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(scores.length);
    expect(scores.every((score) => score > 0)).toBe(true);
  });

  it("matches without diacritics and regardless of case", () => {
    expect(scoreMatch("KHOA HOC", item)).toBeGreaterThan(0);
  });

  it("requires every token to hit", () => {
    expect(scoreMatch("khoa banana", item)).toBe(0);
    expect(scoreMatch("giao khoa", item)).toBeGreaterThan(0);
  });

  it("matches everything for an empty query", () => {
    expect(scoreMatch("   ", item)).toBeGreaterThan(0);
  });
});

describe("rank", () => {
  const items = [
    { label: "Đơn hàng" },
    { label: "Tổng quan", keywords: ["đơn giản"] },
    { label: "Đơn vị" },
  ];

  it("filters non-matches and orders best first, stably", () => {
    expect(rank(items, "don").map((i) => i.label)).toEqual([
      "Đơn hàng",
      "Đơn vị",
      "Tổng quan",
    ]);
    expect(rank(items, "zzz")).toEqual([]);
    expect(rank(items, "")).toEqual(items);
  });
});
