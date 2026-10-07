# Content Import (JSON, Markdown, Excel)

Instructors and admins can create a TEXT lesson or a quiz by uploading a file. Every import lands as a draft (`lessons.is_published = false`, `quizzes.status = DRAFT`) for review before publishing.

## APIs

| Method | Route | Multipart fields | File types |
| --- | --- | --- | --- |
| POST | /admin/import/lesson | `file`, `chapterId` (required), `title` (overrides the file) | `.md`, `.json` |
| POST | /admin/import/quiz | `file`, optional `title`, `scope`, `targetId`, `slug`, `description` (override the file) | `.json`, `.md`, `.xlsx` |

Both routes keep `OriginGuard`, `SessionGuard` and `@Roles('instructor', 'admin')`. Guards run before multer reads the body, so per-resource authority is checked in `ContentImportService`: lessons use the same rule as `LessonOwnershipGuard` (admin, or the course instructor; an unknown chapter is also 403); quizzes go through `QuizAuthoringService.insertDraft`, the same binding and `canManageCourse` checks as `POST /admin/quizzes`.

## Responses

| Status | When |
| --- | --- |
| 201 | Created. The quiz response is the authoring detail plus `import: { format, questionCount }`. |
| 400 | No file, or invalid multipart fields (e.g. `chapterId` not a UUID). |
| 403 | Origin, role, or ownership check failed (`TARGET_COURSE_FORBIDDEN` for quizzes). |
| 413 | File larger than 5 MB, or an `.xlsx` that expands beyond 50 MB / has more than 1000 ZIP entries (`IMPORT_FILE_TOO_LARGE_UNCOMPRESSED`). |
| 415 | `UNSUPPORTED_IMPORT_FILE`: extension, declared MIME type and bytes do not agree. |
| 422 | `IMPORT_VALIDATION_FAILED`: the file content is invalid. Nothing is stored. |

A 422 lists every problem found (up to 100), each with its location:

```json
{
  "statusCode": 422,
  "code": "IMPORT_VALIDATION_FAILED",
  "errors": [
    { "row": 5, "column": "D", "message": "Row 5, Column D: Missing correct answer index" },
    { "line": 12, "message": "Line 12: At least 2 options are required" },
    { "path": "questions[0].points", "message": "questions[0].points: points must not be less than 1" }
  ],
  "totalErrors": 3
}
```

## File type checks

| Extension | Accepted declared MIME types | Byte check |
| --- | --- | --- |
| `.json` | `application/json` | UTF-8 text, not a known binary format |
| `.md`, `.markdown` | `text/markdown`, `text/x-markdown`, `text/plain` | UTF-8 text, not a known binary format |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `file-type` must detect an OOXML spreadsheet |

### Zip-bomb guard (.xlsx)

An `.xlsx` is a ZIP archive, and exceljs unzips all of it into memory. Before exceljs runs, `assertXlsxArchiveWithinLimits` reads the ZIP central directory and inflates every entry with a hard output cap (`maxOutputLength`). The 50 MB total limit therefore holds even when the archive lies about its sizes or points several entries at the same data. Archives with more than 1000 entries, ZIP64 entries, encrypted entries, or compression methods other than stored/deflate are refused.

## Quiz formats

All three formats go through the same validation: settings via `CreateQuizDto`, each question via `CreateQuestionDto`, `sanitizeLessonHtml` on content, options and explanation, then the publish quality gate (`validateQuizStructure`: at least one question, at least 2 options, at least one correct option, exactly one for SINGLE_CHOICE, at least one incorrect option for MULTIPLE_CHOICE, points > 0). Inside the insert transaction, `validateQuizStructureForPublish` checks the stored rows again.

### Excel (.xlsx)

The first worksheet is read. Row 1 is the header and is skipped, as are blank rows. Quiz settings come from the form fields (`title` and `scope` are required).

| Column | Content | Default |
| --- | --- | --- |
| A | Question content (required) | |
| B | `SINGLE_CHOICE` or `MULTIPLE_CHOICE` | `SINGLE_CHOICE` |
| C | Points (whole number > 0) | 10 |
| D | Correct option number: `2`, or `1,3` for MULTIPLE_CHOICE | |
| E–H | Options 1–4 (at least 2) | |
| I | Explanation (optional) | |

Option numbers refer to columns: `3` always means column G, even if column F is empty.

### JSON

```json
{
  "title": "JavaScript basics",
  "scope": "STANDALONE",
  "slug": "javascript-basics",
  "passingScore": 70,
  "questions": [
    {
      "content": "Which values are falsy?",
      "type": "MULTIPLE_CHOICE",
      "points": 4,
      "explanation": "See MDN.",
      "options": [
        { "content": "0", "isCorrect": true },
        { "content": "[]" }
      ]
    }
  ]
}
```

The top-level keys other than `questions` are the `CreateQuizDto` settings. Unknown or server-owned keys (`status`, `createdBy`, ...) are rejected.

### Markdown

```markdown
---
title: JavaScript basics
scope: STANDALONE
slug: javascript-basics
---
## What does `typeof null` return?
Type: SINGLE_CHOICE
Points: 5
- [x] "object"
- [ ] "null"
Explanation: A historical quirk.
```

Front matter holds the settings (`key: value` per line; booleans, integers, quoted strings and `[a, b]` lists). Each `##` heading starts a question. Lines before the first option continue its content. Text before the first question becomes the description.

## Lesson formats

- **Markdown:** optional front matter (`title`, `isPreview`, `isRequired`), then the body. Without a front-matter title, the first `#` heading is used and removed from the body.
- **JSON:** `{ "title", "textBody" }` (HTML) or `{ "title", "markdown" }`, plus optional `isPreview` and `isRequired`.

Markdown is rendered with `marked`, which lets raw HTML through. The HTML is then sanitized with `sanitizeLessonHtml` before validation and storage, which removes scripts, event handlers, `javascript:` URLs and iframes. If nothing safe is left, the import fails with 422.

## Web UI

| Where | Entry point | After a successful import |
| --- | --- | --- |
| Instructor → Course → Curriculum, inside each chapter | "Import từ file" next to "+ Add Lesson" (`ImportLessonDialog`) | The lesson appears in the chapter, unpublished, with a notice to review and publish it. |
| Instructor → Quizzes | "Import từ file" next to "Tạo quiz" (`ImportQuizDialog`) | Redirects to the quiz builder for the new DRAFT. |

Components live in `apps/web/src/features/content-import/`:

- `FileDropzone`: click or drag-and-drop. It checks the extension and the 5 MB limit before uploading.
- `ImportIssueList`: renders a 422 as "Dòng 5 · Cột D | Missing correct answer index", scrolled into view.
- `api.ts`: re-wraps the file with the canonical MIME type for its extension. Browsers often send an empty type or `text/plain` for `.md`; the server still checks the bytes.

For an `.xlsx` file the quiz dialog requires a title and a placement (reusing `TargetSelector`), since the sheet only holds questions. For JSON or Markdown, the file's own settings are used unless "Ghi đè cài đặt trong file" is ticked. A STANDALONE quiz with no slug gets one generated from its title.

Downloadable templates are served from `apps/web/public/templates/`. The API test suite imports each of them, so they cannot drift from the parsers.
