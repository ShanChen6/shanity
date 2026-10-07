import { issueAt, type ImportIssue } from '../import-errors.js';

export type FrontMatter = {
  data: Record<string, unknown>;
  // Body lines after the closing ---, with their 1-based line numbers.
  body: Array<{ text: string; line: number }>;
  issues: ImportIssue[];
};

const KEY = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/;

/**
 * A deliberately small front matter dialect, enough for settings: one
 * `key: value` per line, values being true/false, null, integers, "quoted" or
 * bare strings, and [a, b] lists of strings. No nesting, no anchors, no tags:
 * nothing in an upload can make the parser do more than split strings.
 */
export function splitFrontMatter(text: string): FrontMatter {
  const lines = text.split(/\r?\n/);
  const data: Record<string, unknown> = {};
  const issues: ImportIssue[] = [];
  let start = 0;

  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex(
      (line, index) => index > 0 && line.trim() === '---',
    );
    if (end < 0)
      issues.push(issueAt({ line: 1 }, 'Front matter is never closed by ---'));
    else {
      for (let index = 1; index < end; index++) {
        const line = lines[index]!;
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const match = KEY.exec(line.trim());
        if (!match) {
          issues.push(
            issueAt({ line: index + 1 }, 'Expected a "key: value" setting'),
          );
          continue;
        }
        if (Object.hasOwn(data, match[1]!))
          issues.push(
            issueAt({ line: index + 1 }, `Duplicate setting "${match[1]}"`),
          );
        data[match[1]!] = scalar(match[2]!.trim());
      }
      start = end + 1;
    }
  }

  return {
    data,
    body: lines.slice(start).map((line, index) => ({
      text: line,
      line: start + index + 1,
    })),
    issues,
  };
}

function scalar(value: string): unknown {
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  const quoted = /^(["'])(.*)\1$/.exec(value);
  if (quoted) return quoted[2];
  const list = /^\[(.*)\]$/.exec(value);
  if (list)
    return list[1]!.trim()
      ? list[1]!.split(',').map((item) => {
          const parsed = scalar(item.trim());
          return typeof parsed === 'string' ? parsed : String(parsed);
        })
      : [];
  return value;
}
