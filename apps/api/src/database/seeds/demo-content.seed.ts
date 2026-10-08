import type { EntityManager } from 'typeorm';

/**
 * Content that gives each demo role something to look at: the instructor owns
 * a published and a draft course, the student is enrolled and part-way
 * through one, and an essay answer waits in the instructor's grading queue.
 * Every row has a fixed id and an ON CONFLICT guard, so reruns change nothing.
 */
export const DEMO_COURSE_SLUG = 'demo-thiet-ke-giao-dien-web';
export const DEMO_DRAFT_COURSE_SLUG = 'demo-react-gioi-thieu-nhap';
export const DEMO_ESSAY_QUIZ_SLUG = 'demo-bai-tu-luan-mau';

const ID = {
  course: '18000000-0000-4000-8000-000000000201',
  draftCourse: '18000000-0000-4000-8000-000000000202',
  chapter: '18000000-0000-4000-8000-000000000211',
  lessons: [
    '18000000-0000-4000-8000-000000000221',
    '18000000-0000-4000-8000-000000000222',
    '18000000-0000-4000-8000-000000000223',
  ],
  quiz: '18000000-0000-4000-8000-000000000301',
  question: '18000000-0000-4000-8000-000000000311',
  attempt: '18000000-0000-4000-8000-000000000321',
} as const;

const LESSONS = [
  {
    slug: 'bo-cuc-la-gi',
    title: 'Bố cục là gì?',
    body: '<p>Bố cục là cách sắp xếp các thành phần trên trang để người dùng đọc và thao tác dễ dàng.</p>',
  },
  {
    slug: 'flexbox-co-ban',
    title: 'Flexbox cơ bản',
    body: '<p>Flexbox căn chỉnh các phần tử theo một chiều: hàng hoặc cột.</p>',
  },
  {
    slug: 'css-grid-co-ban',
    title: 'CSS Grid cơ bản',
    body: '<p>Grid chia không gian thành hàng và cột để dựng bố cục hai chiều.</p>',
  },
] as const;

const ESSAY_CONFIG = {
  allowedSubmissionTypes: ['TEXT_WITH_KATEX'],
  maxFileUploads: 0,
  maxWords: 300,
};
const ESSAY_PROMPT =
  'Giải thích khi nào nên dùng Flexbox và khi nào nên dùng Grid.';

async function userId(manager: EntityManager, email: string): Promise<string> {
  const [row] = await manager.query<Array<{ id: string }>>(
    'SELECT id FROM users WHERE email = $1',
    [email],
  );
  if (!row) throw new Error(`Demo account ${email} is missing`);
  return row.id;
}

async function ensureCourses(manager: EntityManager, instructor: string) {
  const courses = [
    {
      id: ID.course,
      slug: DEMO_COURSE_SLUG,
      title: 'Thiết kế giao diện web cơ bản',
      status: 'published',
      shortDescription: 'Làm quen bố cục, Flexbox và Grid qua ba bài học ngắn.',
    },
    {
      id: ID.draftCourse,
      slug: DEMO_DRAFT_COURSE_SLUG,
      title: 'React giới thiệu (bản nháp)',
      status: 'draft',
      shortDescription: 'Khóa học đang soạn, chưa hiển thị với học viên.',
    },
  ];
  for (const course of courses) {
    await manager.query(
      `INSERT INTO courses(id, slug, title, description, short_description,
         category, level, language, status, instructor_id, owner_id, published_at)
       VALUES ($1, $2, $3, $4, $4, 'Design', 'Beginner', 'vi', $5, $6, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        course.id,
        course.slug,
        course.title,
        course.shortDescription,
        course.status,
        instructor,
        // A published course needs a publication date; a draft must not have one.
        course.status === 'published' ? new Date() : null,
      ],
    );
    await manager.query(
      `INSERT INTO course_instructors(course_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [course.id, instructor],
    );
  }
  await manager.query(
    `INSERT INTO chapters(id, course_id, title, description, position)
     VALUES ($1, $2, 'Nền tảng bố cục', 'Ba bài đầu tiên.', 1)
     ON CONFLICT (id) DO NOTHING`,
    [ID.chapter, ID.course],
  );
  for (const [index, lesson] of LESSONS.entries())
    await manager.query(
      `INSERT INTO lessons(id, course_id, chapter_id, title, slug, type,
         position, is_preview, is_published, text_body)
       VALUES ($1, $2, $3, $4, $5, 'TEXT', $6, $7, true, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        ID.lessons[index],
        ID.course,
        ID.chapter,
        lesson.title,
        lesson.slug,
        index + 1,
        index === 0,
        lesson.body,
      ],
    );
}

async function ensureStudentProgress(manager: EntityManager, student: string) {
  await manager.query(
    `INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)
     ON CONFLICT (user_id, course_id) DO NOTHING`,
    [student, ID.course],
  );
  // One finished lesson: the dashboard shows real progress, not 0%.
  await manager.query(
    `INSERT INTO lesson_progress(lesson_id, course_id, user_id, status, completed_at)
     VALUES ($1, $2, $3, 'COMPLETED', now())
     ON CONFLICT (user_id, lesson_id) DO NOTHING`,
    [ID.lessons[0], ID.course, student],
  );
}

async function ensurePendingEssay(
  manager: EntityManager,
  instructor: string,
  student: string,
) {
  await manager.query(
    `INSERT INTO quizzes(id, title, slug, description, scope, status,
       passing_score, created_by, published_at, shuffle_questions, shuffle_options)
     VALUES ($1, 'Bài tự luận mẫu', $2, 'Một câu tự luận để thử luồng chấm bài.',
       'STANDALONE', 'PUBLISHED', 50, $3, now(), false, false)
     ON CONFLICT (id) DO NOTHING`,
    [ID.quiz, DEMO_ESSAY_QUIZ_SLUG, instructor],
  );
  await manager.query(
    `INSERT INTO quiz_questions(id, quiz_id, type, content, position, points, essay_config)
     VALUES ($1, $2, 'ESSAY', $3, 1, 10, $4)
     ON CONFLICT (id) DO NOTHING`,
    [ID.question, ID.quiz, ESSAY_PROMPT, JSON.stringify(ESSAY_CONFIG)],
  );

  const snapshot = {
    schemaVersion: 2,
    quiz: {
      id: ID.quiz,
      version: 1,
      title: 'Bài tự luận mẫu',
      description: 'Một câu tự luận để thử luồng chấm bài.',
      scope: 'STANDALONE',
      targetId: null,
      courseId: null,
      passingScore: 50,
      durationMinutes: null,
      maxAttempts: null,
      reviewPolicy: 'AFTER_SUBMIT',
      gradingPolicy: 'HIGHEST',
    },
    questions: [
      {
        id: ID.question,
        type: 'ESSAY',
        content: ESSAY_PROMPT,
        position: 1,
        points: 10,
        explanation: null,
        essayConfig: ESSAY_CONFIG,
        options: [],
      },
    ],
  };
  // An attempt is only editable while open, so it is created open, answered,
  // then submitted exactly as the application does.
  const inserted = await manager.query<Array<{ id: string }>>(
    `INSERT INTO quiz_attempts(id, user_id, quiz_id, quiz_version, attempt_number,
       quiz_snapshot, status, started_at)
     VALUES ($1, $2, $3, 1, 1, $4, 'IN_PROGRESS', now() - interval '40 minutes')
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [ID.attempt, student, ID.quiz, JSON.stringify(snapshot)],
  );
  if (inserted.length === 0) return;
  await manager.query(
    `INSERT INTO attempt_answers(attempt_id, question_id, essay_answer, grading)
     VALUES ($1, $2, $3, $4)`,
    [
      ID.attempt,
      ID.question,
      JSON.stringify({
        text: 'Flexbox phù hợp với bố cục một chiều như thanh điều hướng. Grid phù hợp với bố cục hai chiều như lưới thẻ khóa học.',
      }),
      JSON.stringify({ status: 'UNGRADED', awardedPoints: null }),
    ],
  );
  await manager.query(
    `UPDATE quiz_attempts
        SET status = 'NEEDS_GRADING', submitted_at = now() - interval '30 minutes',
            score = 0, earned_points = 0, total_points = 10, percentage = 0
      WHERE id = $1`,
    [ID.attempt],
  );
}

export async function seedDemoContent(
  manager: EntityManager,
  emails: { instructor: string; student: string },
): Promise<void> {
  const instructor = await userId(manager, emails.instructor);
  const student = await userId(manager, emails.student);
  await ensureCourses(manager, instructor);
  await ensureStudentProgress(manager, student);
  await ensurePendingEssay(manager, instructor, student);
}
