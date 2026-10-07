import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from '../../support/learning-fixture.js';
import { MAX_XLSX_UNCOMPRESSED_BYTES } from '../../../src/modules/import/parsers/xlsx-archive-guard.js';
import { XLSX_CONTENT_TYPES, zip } from '../../support/zip.js';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADER = [
  'Question',
  'Type',
  'Points',
  'Correct',
  'Option 1',
  'Option 2',
  'Option 3',
  'Option 4',
  'Explanation',
];

type Cell = string | number | null;
type Issue = {
  message: string;
  row?: number;
  column?: string;
  line?: number;
  path?: string;
};

async function workbook(rows: Cell[][], header = true) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Quiz');
  if (header) sheet.addRow(HEADER);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

const slug = () => `import-${randomUUID().slice(0, 8)}`;

describe('File-based content import (JSON, Markdown, Excel)', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let otherInstructor: Account;
  let student: Account;
  let course: CourseFixture;

  beforeAll(async () => {
    t = await learningApp('content-import');
    await t.app.listen(0);
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    otherInstructor = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  type Upload = {
    buffer: Buffer;
    filename: string;
    contentType: string;
    fields?: Record<string, string>;
    session?: string;
    withOrigin?: boolean;
  };
  function upload(
    path: string,
    {
      buffer,
      filename,
      contentType,
      fields = {},
      session = owner.session,
      withOrigin = true,
    }: Upload,
  ) {
    let request = t.http().post(path).set('Cookie', session);
    if (withOrigin) request = request.set('Origin', origin);
    for (const [name, value] of Object.entries(fields))
      request = request.field(name, value);
    return request.attach('file', buffer, { filename, contentType });
  }
  const importQuiz = (options: Upload) => upload('/admin/import/quiz', options);
  const importLesson = (options: Upload) =>
    upload('/admin/import/lesson', options);
  const standalone = (title = 'Imported quiz') => ({
    title,
    scope: 'STANDALONE',
    slug: slug(),
  });

  const storedQuestions = async (quizId: string) =>
    (await t.db.query(
      `SELECT question.content, question.type, question.points,
         question.position, question.explanation,
         coalesce(json_agg(json_build_object(
           'content', option.content, 'isCorrect', option.is_correct)
           ORDER BY option.position) FILTER (WHERE option.id IS NOT NULL),
           '[]') AS options
       FROM quiz_questions question
       LEFT JOIN quiz_options option ON option.question_id = question.id
       WHERE question.quiz_id = $1
       GROUP BY question.id ORDER BY question.position`,
      [quizId],
    )) as Array<{
      content: string;
      type: string;
      points: number;
      position: number;
      explanation: string | null;
      options: Array<{ content: string; isCorrect: boolean }>;
    }>;
  const quizCountBySlug = async (value: string) =>
    Number(
      (
        await t.db.query(
          'SELECT count(*)::int AS n FROM quizzes WHERE slug = $1',
          [value],
        )
      )[0].n,
    );
  const messages = (body: { errors: Issue[] }) =>
    body.errors.map(({ message }) => message);

  describe('Excel (.xlsx) quiz import', () => {
    it('creates a DRAFT quiz from the A..I column layout', async () => {
      const fields = standalone('Excel quiz');
      const response = await importQuiz({
        buffer: await workbook([
          [
            'What is 2 + 2?',
            'SINGLE_CHOICE',
            5,
            2,
            '3',
            '4',
            '5',
            null,
            'Basic arithmetic',
          ],
          // Blank type and points fall back to SINGLE_CHOICE and 10.
          ['Capital of France?', null, null, '1', 'Paris', 'Rome'],
          [],
          [
            'Pick the prime numbers',
            'MULTIPLE_CHOICE',
            20,
            '1,3',
            '2',
            '4',
            '5',
            '6',
          ],
        ]),
        filename: 'quiz.xlsx',
        contentType: XLSX,
        fields,
      }).expect(201);

      expect(response.body).toMatchObject({
        title: 'Excel quiz',
        scope: 'STANDALONE',
        slug: fields.slug,
        status: 'DRAFT',
        version: 1,
        createdBy: owner.id,
        import: { format: 'xlsx', questionCount: 3 },
      });
      expect(await storedQuestions(response.body.id)).toEqual([
        {
          content: 'What is 2 + 2?',
          type: 'SINGLE_CHOICE',
          points: 5,
          position: 1,
          explanation: 'Basic arithmetic',
          options: [
            { content: '3', isCorrect: false },
            { content: '4', isCorrect: true },
            { content: '5', isCorrect: false },
          ],
        },
        {
          content: 'Capital of France?',
          type: 'SINGLE_CHOICE',
          points: 10,
          position: 2,
          explanation: null,
          options: [
            { content: 'Paris', isCorrect: true },
            { content: 'Rome', isCorrect: false },
          ],
        },
        {
          content: 'Pick the prime numbers',
          type: 'MULTIPLE_CHOICE',
          points: 20,
          position: 3,
          explanation: null,
          options: [
            { content: '2', isCorrect: true },
            { content: '4', isCorrect: false },
            { content: '5', isCorrect: true },
            { content: '6', isCorrect: false },
          ],
        },
      ]);

      // The imported draft passes the real publish quality gate as-is.
      await t
        .http()
        .post(`/admin/quizzes/${response.body.id}/publish`)
        .set('Origin', origin)
        .set('Cookie', owner.session)
        .expect(200);
    });

    it('answers 422 with the row and column of every bad cell, storing nothing', async () => {
      const fields = standalone();
      const response = await importQuiz({
        buffer: await workbook([
          ['Fine question', null, 10, 1, 'Yes', 'No'], // row 2
          ['No answer key', null, 10, null, 'Yes', 'No'], // row 3
          [null, 'TRUE_FALSE', 0, 1, 'Only one'], // row 4
          ['Points to an empty option', null, 10, 3, 'Yes', 'No'], // row 5
          ['Two keys for single choice', null, 10, '1,2', 'A', 'B'], // row 6
          ['Index out of range', null, 'ten', 7, 'A', 'B'], // row 7
        ]),
        filename: 'broken.xlsx',
        contentType: XLSX,
        fields,
      }).expect(422);

      expect(response.body).toMatchObject({
        statusCode: 422,
        code: 'IMPORT_VALIDATION_FAILED',
      });
      expect(messages(response.body)).toEqual([
        'Row 3, Column D: Missing correct answer index',
        'Row 4, Column A: Missing question content',
        'Row 4, Column B: Invalid question type "TRUE_FALSE"; use SINGLE_CHOICE or MULTIPLE_CHOICE',
        'Row 4, Column C: Points must be a whole number greater than 0, got "0"',
        'Row 4, Column E-H: At least 2 options are required',
        'Row 5, Column D: Correct answer index 3 points to an empty option (Column G)',
        'Row 6, Column D: SINGLE_CHOICE allows exactly one correct answer index',
        'Row 7, Column C: Points must be a whole number greater than 0, got "ten"',
        'Row 7, Column D: Correct answer index "7" must be a number from 1 to 4',
      ]);
      expect(response.body.errors[0]).toMatchObject({ row: 3, column: 'D' });
      expect(await quizCountBySlug(fields.slug)).toBe(0);
    });

    it('rejects a sheet with only the header row', async () => {
      const response = await importQuiz({
        buffer: await workbook([]),
        filename: 'empty.xlsx',
        contentType: XLSX,
        fields: standalone(),
      }).expect(422);
      expect(messages(response.body)).toEqual([
        'The file contains no questions',
      ]);
    });

    it('requires quiz settings from the form, validated like POST /admin/quizzes', async () => {
      const response = await importQuiz({
        buffer: await workbook([['Q', null, 10, 1, 'A', 'B']]),
        filename: 'quiz.xlsx',
        contentType: XLSX,
        fields: { scope: 'STANDALONE', slug: 'Not A Slug' },
      }).expect(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'title' }),
          expect.objectContaining({ path: 'slug' }),
        ]),
      );
    });

    it('refuses a zip bomb before exceljs unzips it (413), storing nothing', async () => {
      const fields = standalone();
      const bomb = zip([
        XLSX_CONTENT_TYPES,
        {
          name: 'xl/sharedStrings.xml',
          data: Buffer.alloc(MAX_XLSX_UNCOMPRESSED_BYTES + 1024 * 1024),
          // Claims to be tiny; only real inflation reveals the size.
          declaredSize: 64,
        },
      ]);
      expect(bomb.length).toBeLessThan(1024 * 1024);

      const response = await importQuiz({
        buffer: bomb,
        filename: 'bomb.xlsx',
        contentType: XLSX,
        fields,
      }).expect(413);
      expect(response.body.code).toBe('IMPORT_FILE_TOO_LARGE_UNCOMPRESSED');
      expect(await quizCountBySlug(fields.slug)).toBe(0);
    });

    it('rejects bytes that are not a real spreadsheet (415)', async () => {
      await importQuiz({
        buffer: Buffer.from('Question,Type\nQ,SINGLE_CHOICE\n'),
        filename: 'quiz.xlsx',
        contentType: XLSX,
        fields: standalone(),
      })
        .expect(415)
        .expect(({ body }) =>
          expect(body.code).toBe('UNSUPPORTED_IMPORT_FILE'),
        );
    });
  });

  describe('JSON quiz import', () => {
    const quizJson = (overrides: object = {}) => ({
      title: 'JSON quiz',
      scope: 'LESSON',
      targetId: course.lessons[0]!.id,
      passingScore: 70,
      tags: ['JavaScript'],
      questions: [
        {
          content: 'Which are falsy?',
          type: 'MULTIPLE_CHOICE',
          points: 4,
          explanation: '<p>See MDN</p>',
          options: [
            { content: '0', isCorrect: true },
            { content: '""', isCorrect: true },
            { content: '[]' },
          ],
        },
        {
          content: 'typeof null?',
          options: [
            { content: 'object', isCorrect: true },
            { content: 'null' },
          ],
        },
      ],
      ...overrides,
    });
    const json = (value: unknown) => Buffer.from(JSON.stringify(value));

    it('creates a DRAFT bound to the lesson with the settings from the file', async () => {
      const response = await importQuiz({
        buffer: json(quizJson()),
        filename: 'quiz.json',
        contentType: 'application/json',
        // Form fields override the file.
        fields: { title: 'Overridden title' },
      }).expect(201);

      expect(response.body).toMatchObject({
        title: 'Overridden title',
        scope: 'LESSON',
        targetId: course.lessons[0]!.id,
        courseId: course.id,
        status: 'DRAFT',
        passingScore: 70,
        tags: ['javascript'],
        import: { format: 'json', questionCount: 2 },
      });
      const questions = await storedQuestions(response.body.id);
      expect(questions.map(({ type, points }) => [type, points])).toEqual([
        ['MULTIPLE_CHOICE', 4],
        ['SINGLE_CHOICE', 10],
      ]);
      expect(questions[0]!.options.map(({ isCorrect }) => isCorrect)).toEqual([
        true,
        true,
        false,
      ]);
    });

    it('reports every invalid question by JSON path (422)', async () => {
      const response = await importQuiz({
        buffer: json(
          quizJson({
            questions: [
              {
                content: 'Two keys',
                points: 0,
                options: [
                  { content: 'A', isCorrect: true },
                  { content: 'B', isCorrect: true },
                ],
              },
              {
                content: 'No key',
                options: [{ content: 'A' }, { content: 'B' }],
              },
              {
                content: 'All correct',
                type: 'MULTIPLE_CHOICE',
                options: [
                  { content: 'A', isCorrect: true },
                  { content: 'B', isCorrect: true },
                ],
              },
              {
                content: 'One option',
                options: [{ content: 'A', isCorrect: true }],
              },
            ],
          }),
        ),
        filename: 'quiz.json',
        contentType: 'application/json',
      }).expect(422);

      const errors = response.body.errors as Issue[];
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'questions[0].points' }),
          expect.objectContaining({
            message:
              'questions[1].options: Missing correct answer: mark at least one option correct',
          }),
          expect.objectContaining({
            message:
              'questions[2].options: MULTIPLE_CHOICE needs at least one incorrect option',
          }),
          expect.objectContaining({
            message: 'questions[3].options: At least 2 options are required',
          }),
        ]),
      );
    });

    it('reports SINGLE_CHOICE with several correct options', async () => {
      const response = await importQuiz({
        buffer: json(
          quizJson({
            questions: [
              {
                content: 'Two keys',
                options: [
                  { content: 'A', isCorrect: true },
                  { content: 'B', isCorrect: true },
                ],
              },
            ],
          }),
        ),
        filename: 'quiz.json',
        contentType: 'application/json',
      }).expect(422);
      expect(messages(response.body)).toEqual([
        'questions[0].options: SINGLE_CHOICE allows exactly one correct option',
      ]);
    });

    it('rejects malformed JSON, unknown properties and server-owned fields', async () => {
      await importQuiz({
        buffer: Buffer.from('{"title": "x", '),
        filename: 'quiz.json',
        contentType: 'application/json',
      })
        .expect(422)
        .expect(({ body }) =>
          expect(body.errors[0].message).toMatch(/^Invalid JSON/),
        );

      const response = await importQuiz({
        buffer: json(quizJson({ status: 'PUBLISHED', createdBy: student.id })),
        filename: 'quiz.json',
        contentType: 'application/json',
      }).expect(422);
      expect(response.body.errors.map((issue: Issue) => issue.path)).toEqual(
        expect.arrayContaining(['status', 'createdBy']),
      );
    });

    it('refuses a target course the instructor does not manage, storing nothing', async () => {
      const value = slug();
      await importQuiz({
        buffer: json(quizJson({ slug: value })),
        filename: 'quiz.json',
        contentType: 'application/json',
        session: otherInstructor.session,
      })
        .expect(403)
        .expect(({ body }) =>
          expect(body.code).toBe('TARGET_COURSE_FORBIDDEN'),
        );
      expect(await quizCountBySlug(value)).toBe(0);
    });
  });

  describe('Markdown quiz import', () => {
    const markdown = (body: string) =>
      Buffer.from(
        [
          '---',
          'title: Markdown quiz',
          'scope: STANDALONE',
          `slug: ${slug()}`,
          'passingScore: 60',
          '---',
          '',
          body,
        ].join('\n'),
      );

    it('creates a DRAFT and strips script from imported content', async () => {
      const response = await importQuiz({
        buffer: markdown(
          [
            '## What does `typeof null` return?<script>alert(1)</script>',
            'Points: 5',
            '- [x] "object"',
            '- [ ] "null"',
            'Explanation: A historical quirk.',
            '',
            '## Pick the even numbers',
            'Type: MULTIPLE_CHOICE',
            '- [X] 2',
            '- [ ] 3',
            '- [x] <img src=x onerror=alert(1)>4',
          ].join('\n'),
        ),
        filename: 'quiz.md',
        contentType: 'text/markdown',
      }).expect(201);

      expect(response.body).toMatchObject({
        title: 'Markdown quiz',
        passingScore: 60,
        status: 'DRAFT',
        import: { format: 'markdown', questionCount: 2 },
      });
      const questions = await storedQuestions(response.body.id);
      expect(questions[0]).toMatchObject({
        content: 'What does `typeof null` return?',
        points: 5,
        explanation: 'A historical quirk.',
      });
      expect(questions[1]!.type).toBe('MULTIPLE_CHOICE');
      expect(questions[1]!.options.map(({ isCorrect }) => isCorrect)).toEqual([
        true,
        false,
        true,
      ]);
      const stored = JSON.stringify(questions);
      expect(stored).not.toMatch(/<script|onerror|alert/i);
    });

    it('reports bad questions by line number (422)', async () => {
      const response = await importQuiz({
        buffer: markdown(
          [
            '## No correct answer', // line 8
            '- [ ] A',
            '- [ ] B',
            '',
            '## Bad points', // line 12
            'Points: lots',
            '- [x] A',
            '- [ ] B',
          ].join('\n'),
        ),
        filename: 'quiz.md',
        contentType: 'text/plain',
      }).expect(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            line: 8,
            message:
              'Line 8: Missing correct answer: mark at least one option correct',
          }),
          expect.objectContaining({ line: 12 }),
        ]),
      );
    });
  });

  describe('file type checks and authorization', () => {
    const tiny = Buffer.from(JSON.stringify({ title: 'x', questions: [] }));

    it('requires a file and an extension, MIME type and bytes that agree', async () => {
      await t
        .http()
        .post('/admin/import/quiz')
        .set('Origin', origin)
        .set('Cookie', owner.session)
        .field('title', 'No file')
        .expect(400);
      for (const [filename, contentType] of [
        ['quiz.json', 'text/markdown'],
        ['quiz.md', 'application/json'],
        ['quiz.exe', 'application/json'],
        ['quiz.json', XLSX],
      ])
        await importQuiz({ buffer: tiny, filename, contentType }).expect(415);
      // A PNG renamed to .json.
      await importQuiz({
        buffer: Buffer.from(
          '89504e470d0a1a0a0000000d4948445200000001000000010806000000',
          'hex',
        ),
        filename: 'quiz.json',
        contentType: 'application/json',
      }).expect(415);
    });

    it('keeps OriginGuard, SessionGuard and the instructor/admin roles', async () => {
      const options = {
        buffer: tiny,
        filename: 'quiz.json',
        contentType: 'application/json',
      };
      await importQuiz({ ...options, session: student.session }).expect(403);
      await importQuiz({ ...options, session: '' }).expect(401);
      await importQuiz({ ...options, withOrigin: false }).expect(403);
      await importLesson({
        ...options,
        fields: { chapterId: course.chapterId },
        session: student.session,
      }).expect(403);
    });
  });

  describe('downloadable templates (apps/web/public/templates)', () => {
    const template = (name: string) =>
      readFileSync(
        new URL(`../../../../web/public/templates/${name}`, import.meta.url),
      );

    it('imports every quiz template as-is', async () => {
      for (const [filename, contentType, questionCount] of [
        ['quiz-import-template.xlsx', XLSX, 3],
        ['quiz-import-sample.json', 'application/json', 2],
        ['quiz-import-sample.md', 'text/markdown', 2],
      ] as const) {
        const response = await importQuiz({
          buffer: template(filename),
          filename,
          contentType,
          // Templates share a slug; the Excel one has no settings at all.
          fields: standalone(`Template ${filename}`),
        }).expect(201);
        expect(response.body.import.questionCount).toBe(questionCount);
      }
    });

    it('imports every lesson template as-is', async () => {
      for (const [filename, contentType] of [
        ['lesson-import-sample.md', 'text/markdown'],
        ['lesson-import-sample.json', 'application/json'],
      ] as const)
        await importLesson({
          buffer: template(filename),
          filename,
          contentType,
          fields: { chapterId: course.chapterId },
        }).expect(201);
    });
  });

  describe('lesson import', () => {
    const lessonRow = async (id: string) =>
      (
        (await t.db.query(
          `SELECT title, type, text_body AS "textBody",
             is_published AS "isPublished", is_preview AS "isPreview",
             chapter_id AS "chapterId"
           FROM lessons WHERE id = $1`,
          [id],
        )) as Array<Record<string, unknown>>
      )[0]!;

    it('turns Markdown into a sanitized, unpublished TEXT lesson (no stored XSS)', async () => {
      const response = await importLesson({
        buffer: Buffer.from(
          [
            '---',
            'title: Closures explained',
            'isPreview: true',
            '---',
            '## Scope',
            'A **closure** keeps its [scope](https://developer.mozilla.org).',
            '',
            '<script>document.cookie</script>',
            '<img src="x" onerror="alert(1)">',
            '<a href="javascript:alert(1)">click</a>',
            '<iframe src="https://evil.example"></iframe>',
            '',
            '```js',
            'const add = (a) => (b) => a + b;',
            '```',
          ].join('\n'),
        ),
        filename: 'closures.md',
        contentType: 'text/markdown',
        fields: { chapterId: course.chapterId },
      }).expect(201);

      const lesson = await lessonRow(response.body.id);
      expect(lesson).toMatchObject({
        title: 'Closures explained',
        type: 'TEXT',
        isPublished: false,
        isPreview: true,
        chapterId: course.chapterId,
      });
      const html = lesson.textBody as string;
      expect(html).toContain('<h2>Scope</h2>');
      expect(html).toContain('<strong>closure</strong>');
      expect(html).toContain('href="https://developer.mozilla.org"');
      expect(html).toContain('<pre><code>');
      expect(html).not.toMatch(
        /<script|onerror|javascript:|<iframe|document\.cookie/i,
      );
    });

    it('imports JSON lessons (HTML or markdown) and sanitizes them', async () => {
      const response = await importLesson({
        buffer: Buffer.from(
          JSON.stringify({
            title: 'From the file',
            textBody:
              '<p onclick="steal()">Hello</p><script>alert(1)</script><style>p{}</style>',
          }),
        ),
        filename: 'lesson.json',
        contentType: 'application/json',
        fields: { chapterId: course.chapterId, title: 'From the form' },
      }).expect(201);
      expect(await lessonRow(response.body.id)).toMatchObject({
        title: 'From the form',
        textBody: '<p>Hello</p>',
        isPublished: false,
      });

      const fromMarkdown = await importLesson({
        buffer: Buffer.from(
          JSON.stringify({
            title: 'Markdown in JSON',
            markdown: '# Hi\n\n*there*',
          }),
        ),
        filename: 'lesson.json',
        contentType: 'application/json',
        fields: { chapterId: course.chapterId },
      }).expect(201);
      expect((await lessonRow(fromMarkdown.body.id)).textBody).toBe(
        '<h1>Hi</h1>\n<p><em>there</em></p>',
      );
    });

    it('takes the first # heading as the title when front matter has none', async () => {
      const response = await importLesson({
        buffer: Buffer.from('# Heading title\n\nBody text.'),
        filename: 'lesson.md',
        contentType: 'text/plain',
        fields: { chapterId: course.chapterId },
      }).expect(201);
      expect(await lessonRow(response.body.id)).toMatchObject({
        title: 'Heading title',
        textBody: '<p>Body text.</p>',
      });
    });

    it('answers 422 when nothing safe is left, or the file is invalid', async () => {
      const onlyScript = await importLesson({
        buffer: Buffer.from('---\ntitle: Evil\n---\n<script>alert(1)</script>'),
        filename: 'evil.md',
        contentType: 'text/markdown',
        fields: { chapterId: course.chapterId },
      }).expect(422);
      expect(messages(onlyScript.body)).toEqual([
        'body: Lesson body is empty after removing unsafe HTML',
      ]);

      const invalid = await importLesson({
        buffer: Buffer.from(
          JSON.stringify({ textBody: '<p>x</p>', markdown: 'x', extra: 1 }),
        ),
        filename: 'lesson.json',
        contentType: 'application/json',
        fields: { chapterId: course.chapterId },
      }).expect(422);
      expect(invalid.body.errors.map((issue: Issue) => issue.path)).toEqual(
        expect.arrayContaining(['$.extra', '$']),
      );
    });

    it('only lets the course instructor (or an admin) import into a chapter', async () => {
      const options = {
        buffer: Buffer.from('# Title\n\nBody'),
        filename: 'lesson.md',
        contentType: 'text/markdown',
      };
      await importLesson({
        ...options,
        fields: { chapterId: course.chapterId },
        session: otherInstructor.session,
      }).expect(403);
      await importLesson({
        ...options,
        fields: { chapterId: randomUUID() },
      }).expect(403);
      await importLesson({ ...options, fields: { chapterId: 'nope' } }).expect(
        400,
      );
      await importLesson({
        ...options,
        buffer: await workbook([['Q', null, 10, 1, 'A', 'B']]),
        filename: 'lesson.xlsx',
        contentType: XLSX,
        fields: { chapterId: course.chapterId },
      }).expect(415);
    });
  });
});
