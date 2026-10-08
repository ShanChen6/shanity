/** Matching for the command menu: forgiving about case and Vietnamese diacritics. */

/** "Khóa học" -> "khoa hoc"; so "khoa hoc" and "Khóa" both find it. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

export interface Searchable {
  label: string;
  keywords?: readonly string[];
}

/** 0 = no match; higher = better. An empty query matches everything equally. */
export function scoreMatch(query: string, item: Searchable): number {
  const q = normalize(query);
  if (!q) return 1;
  const label = normalize(item.label);
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/\s+/).some((word) => word.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  const haystack = [label, ...(item.keywords ?? []).map(normalize)].join(" ");
  return q.split(/\s+/).every((token) => haystack.includes(token)) ? 20 : 0;
}

/** Matches, best first; ties keep their original order. */
export function rank<T extends Searchable>(
  items: readonly T[],
  query: string,
): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreMatch(query, item) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}
