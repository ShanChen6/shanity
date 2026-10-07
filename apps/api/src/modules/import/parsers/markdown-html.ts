import { Marked } from 'marked';

// Own instance: never touches marked's global defaults. Its output is NOT
// safe (raw HTML passes through); callers must run sanitizeLessonHtml on it.
const marked = new Marked({ gfm: true, breaks: false });

export const markdownToUnsafeHtml = (markdown: string) =>
  marked.parse(markdown, { async: false });
