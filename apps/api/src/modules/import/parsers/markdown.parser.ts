import { ImportValidationException, issueAt } from '../import-errors.js';
import { fileText } from '../import-file.js';
import { splitFrontMatter } from './front-matter.js';
import type {
  LessonFileParser,
  ParsedLesson,
  ParsedQuestion,
  ParsedQuiz,
  QuizFileParser,
} from './import-parser.types.js';
import { markdownToUnsafeHtml } from './markdown-html.js';

const TITLE = /^#\s+(.+?)\s*#*$/;
const QUESTION = /^##\s+(.+?)\s*#*$/;
const OPTION = /^[-*]\s+\[([ xX])\]\s+(.*)$/;
const FIELD = /^(type|points|explanation)\s*:\s*(.*)$/i;
const LESSON_SETTINGS = new Set(['title', 'isPreview', 'isRequired']);

type Draft = ParsedQuestion & {
  contentLines: string[];
  explanationLines: string[] | null;
};

/**
 * Quiz Markdown:
 *
 *     ---
 *     title: JavaScript basics
 *     scope: STANDALONE
 *     slug: javascript-basics
 *     ---
 *     ## What does `typeof null` return?
 *     Type: SINGLE_CHOICE        (optional, default SINGLE_CHOICE)
 *     Points: 5                  (optional, default 10)
 *     - [x] "object"
 *     - [ ] "null"
 *     Explanation: A historical quirk.
 *
 * Each `##` heading starts a question; further lines before the first option
 * continue its prompt. Lesson Markdown is front matter (title, isPreview,
 * isRequired) plus a body; without a front matter title the first `#`
 * heading is the title.
 */
export class MarkdownParser implements QuizFileParser, LessonFileParser {
  parseQuiz(buffer: Buffer): ParsedQuiz {
    const { data: settings, body, issues } = splitFrontMatter(fileText(buffer));
    const questions: Draft[] = [];
    const preamble: string[] = [];
    let current: Draft | undefined;

    for (const { text, line } of body) {
      const trimmed = text.trim();
      const heading = QUESTION.exec(trimmed);
      if (heading) {
        current = {
          content: undefined,
          contentLines: [heading[1]!],
          explanationLines: null,
          options: [],
          source: { at: { line } },
        };
        questions.push(current);
        continue;
      }
      if (!current) {
        const title = TITLE.exec(trimmed);
        if (title && settings.title === undefined) settings.title = title[1];
        else if (trimmed) preamble.push(trimmed);
        continue;
      }
      if (!trimmed) {
        current.explanationLines?.push('');
        continue;
      }

      const option = OPTION.exec(trimmed);
      const field = FIELD.exec(trimmed);
      if (option) {
        if (current.explanationLines)
          issues.push(
            issueAt({ line }, 'Options must come before the explanation'),
          );
        current.options.push({
          content: option[2]!.trim(),
          isCorrect: option[1] !== ' ',
        });
      } else if (field) {
        const [, rawName, rawValue] = field;
        const name = rawName!.toLowerCase();
        const value = rawValue!.trim();
        if (name === 'explanation') current.explanationLines = [value];
        else if (name === 'type') current.type = value.toUpperCase();
        else current.points = /^-?\d+$/.test(value) ? Number(value) : value;
      } else if (current.explanationLines) current.explanationLines.push(text);
      else if (current.options.length)
        issues.push(
          issueAt(
            { line },
            'Unexpected text after the options; options look like "- [x] Answer"',
          ),
        );
      else current.contentLines.push(text);
    }

    if (preamble.length && settings.description === undefined)
      settings.description = preamble.join('\n');
    if (issues.length) throw new ImportValidationException(issues);

    return {
      settings,
      questions: questions.map(
        ({ contentLines, explanationLines, ...question }) => ({
          ...question,
          content: contentLines.join('\n').trim(),
          explanation: explanationLines?.join('\n').trim() || undefined,
        }),
      ),
    };
  }

  parseLesson(buffer: Buffer): ParsedLesson {
    const { data, body, issues } = splitFrontMatter(fileText(buffer));
    for (const key of Object.keys(data))
      if (!LESSON_SETTINGS.has(key))
        issues.push(issueAt({ path: key }, 'Unknown lesson setting'));
    if (issues.length) throw new ImportValidationException(issues);

    let title = data.title;
    let lines = body.map(({ text }) => text);
    if (title === undefined) {
      const index = lines.findIndex((text) => TITLE.test(text.trim()));
      if (index >= 0) {
        title = TITLE.exec(lines[index]!.trim())![1];
        lines = lines.filter((_text, other) => other !== index);
      }
    }
    return {
      title,
      isPreview: data.isPreview,
      isRequired: data.isRequired,
      html: markdownToUnsafeHtml(lines.join('\n')),
    };
  }
}
