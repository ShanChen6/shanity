/**
 * Single source of truth for the `/api/v1/<domain>/*` surface.
 *
 * The legacy, unprefixed routes keep working untouched (the web app and the
 * suites depend on them). Each v1 route is an alias of exactly one legacy
 * route: the router middleware rewrites the URL, so the same handler, guards
 * and DTO validation run. v1 responses additionally use the standard envelope.
 *
 * Domains:
 *  - public      no session
 *  - student     any signed-in user (handlers still narrow with @Roles)
 *  - me          the caller's own account, any role
 *  - instructor  instructor | admin
 *  - admin       admin | finance_officer
 *
 * Intentionally NOT aliased (kept at their stable URLs): `/auth/*` (OAuth
 * redirect URIs are registered with Google), signed media/avatar streams and
 * `/health/*`, and the payment routes that already live under `/api/v1/*`.
 */
export type ApiDomain = 'public' | 'student' | 'me' | 'instructor' | 'admin';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const API_V1_PREFIX = '/api/v1';

export const DOMAIN_ROLES: Record<ApiDomain, readonly string[] | 'public'> = {
  public: 'public',
  student: ['student', 'instructor', 'admin', 'finance_officer'],
  me: ['student', 'instructor', 'admin', 'finance_officer'],
  instructor: ['instructor', 'admin'],
  admin: ['admin', 'finance_officer'],
};

export interface ApiV1Route {
  methods: readonly HttpMethod[];
  /** Path below `/api/v1`, starting with the domain. */
  v1: string;
  /** The existing route this alias resolves to. Same `:param` names as `v1`. */
  legacy: string;
}

const GET = ['GET'] as const;
const POST = ['POST'] as const;
const PUT = ['PUT'] as const;
const PATCH = ['PATCH'] as const;
const DELETE = ['DELETE'] as const;

const route = (
  methods: readonly HttpMethod[],
  v1: string,
  legacy: string = v1,
): ApiV1Route => ({ methods, v1, legacy });

export const API_V1_ROUTES: readonly ApiV1Route[] = [
  // ── public ────────────────────────────────────────────────────────────
  route(GET, '/public/courses'),
  route(GET, '/public/courses/:slug'),
  route(GET, '/public/courses/:slug/syllabus'),

  // ── student ───────────────────────────────────────────────────────────
  route(GET, '/student/courses', '/courses'),
  route(GET, '/student/courses/:id', '/courses/:id'),
  route(POST, '/student/courses/:courseId/enroll', '/courses/:courseId/enroll'),
  route(
    GET,
    '/student/courses/:courseId/enrollment-status',
    '/courses/:courseId/enrollment-status',
  ),
  route(GET, '/student/courses/:courseId/progress', '/courses/:courseId/progress'),
  route(
    GET,
    '/student/courses/:courseId/resume-lesson',
    '/courses/:courseId/resume-lesson',
  ),
  route(GET, '/student/courses/:courseId/quizzes', '/courses/:courseId/quizzes'),
  route(POST, '/student/enrollments/free', '/enrollments/free'),
  route(GET, '/student/enrolled-courses'),
  route(GET, '/student/resume-course'),
  route(GET, '/student/payments/methods', '/payments/methods'),
  route(GET, '/student/lessons/:id', '/lessons/:id'),
  route(GET, '/student/lessons/:id/document-view', '/lessons/:id/document-view'),
  route(
    GET,
    '/student/lessons/:id/document-download',
    '/lessons/:id/document-download',
  ),
  route(GET, '/student/lessons/:id/video-access', '/lessons/:id/video-access'),
  route(
    PATCH,
    '/student/lessons/:id/video-progress',
    '/lessons/:id/video-progress',
  ),
  route(
    POST,
    '/student/lessons/:lessonId/progress/start',
    '/lessons/:lessonId/progress/start',
  ),
  route(
    PATCH,
    '/student/lessons/:lessonId/progress/heartbeat',
    '/lessons/:lessonId/progress/heartbeat',
  ),
  route(
    POST,
    '/student/lessons/:lessonId/progress/complete',
    '/lessons/:lessonId/progress/complete',
  ),
  route(GET, '/student/quizzes/standalone', '/quizzes/standalone'),
  route(GET, '/student/quizzes/standalone/:slug', '/quizzes/standalone/:slug'),
  route(GET, '/student/quizzes/:id/take', '/quizzes/:id/take'),
  route(POST, '/student/quizzes/:id/attempts', '/quizzes/:id/attempts'),
  route(GET, '/student/quizzes/:id/active-attempt', '/quizzes/:id/active-attempt'),
  route(GET, '/student/quiz-attempts', '/my-quiz-attempts'),
  route(GET, '/student/quiz-attempts/:attemptId', '/quiz-attempts/:attemptId'),
  route(
    PUT,
    '/student/quiz-attempts/:attemptId/answers',
    '/quiz-attempts/:attemptId/answers',
  ),
  route(
    PATCH,
    '/student/quiz-attempts/:attemptId/answers/draft',
    '/quiz-attempts/:attemptId/answers/draft',
  ),
  route(
    POST,
    '/student/quiz-attempts/:attemptId/attachments/signature',
    '/quiz-attempts/:attemptId/attachments/signature',
  ),
  route(
    GET,
    '/student/quiz-attempts/:attemptId/result',
    '/quiz-attempts/:attemptId/result',
  ),
  route(
    GET,
    '/student/quiz-attempts/:attemptId/student-result',
    '/quiz-attempts/:attemptId/student-result',
  ),
  route(
    POST,
    '/student/quiz-attempts/:attemptId/submit',
    '/quiz-attempts/:attemptId/submit',
  ),

  // ── me ────────────────────────────────────────────────────────────────
  route(GET, '/me', '/users/me'),
  route(PATCH, '/me', '/users/me'),
  route(PATCH, '/me/password', '/users/me/password'),
  route(POST, '/me/avatar', '/users/me/avatar'),
  route(DELETE, '/me/avatar', '/users/me/avatar'),

  // ── instructor: courses, chapters, lessons ────────────────────────────
  route(GET, '/instructor/courses', '/courses'),
  route(POST, '/instructor/courses', '/courses'),
  route(GET, '/instructor/courses/:id', '/courses/:id'),
  route(PATCH, '/instructor/courses/:id', '/courses/:id'),
  route(POST, '/instructor/courses/:id/publish', '/courses/:id/publish'),
  route(POST, '/instructor/courses/:id/unpublish', '/courses/:id/unpublish'),
  route(POST, '/instructor/courses/:id/archive', '/courses/:id/archive'),
  route(PATCH, '/instructor/courses/:id/pricing', '/courses/:id/pricing'),
  route(
    GET,
    '/instructor/courses/:id/pricing-history',
    '/courses/:id/pricing-history',
  ),
  route(
    POST,
    '/instructor/courses/:courseId/thumbnail',
    '/courses/:courseId/thumbnail',
  ),
  route(GET, '/instructor/courses/:courseId/chapters', '/courses/:courseId/chapters'),
  route(POST, '/instructor/courses/:courseId/chapters', '/courses/:courseId/chapters'),
  route(
    PATCH,
    '/instructor/courses/:courseId/chapters/reorder',
    '/courses/:courseId/chapters/reorder',
  ),
  route(PATCH, '/instructor/chapters/:id', '/chapters/:id'),
  route(DELETE, '/instructor/chapters/:id', '/chapters/:id'),
  route(GET, '/instructor/courses/:courseId/lessons', '/courses/:courseId/lessons'),
  route(
    POST,
    '/instructor/courses/:courseId/chapters/:chapterId/lessons',
    '/courses/:courseId/chapters/:chapterId/lessons',
  ),
  route(
    PATCH,
    '/instructor/courses/:courseId/chapters/:chapterId/lessons/reorder',
    '/courses/:courseId/chapters/:chapterId/lessons/reorder',
  ),
  route(
    PATCH,
    '/instructor/courses/:courseId/lessons/:id',
    '/courses/:courseId/lessons/:id',
  ),
  route(
    DELETE,
    '/instructor/courses/:courseId/lessons/:id',
    '/courses/:courseId/lessons/:id',
  ),
  route(
    GET,
    '/instructor/chapters/:chapterId/lessons',
    '/chapters/:chapterId/lessons',
  ),
  route(
    POST,
    '/instructor/chapters/:chapterId/lessons',
    '/chapters/:chapterId/lessons',
  ),
  route(
    POST,
    '/instructor/chapters/:chapterId/lessons/video-upload',
    '/chapters/:chapterId/lessons/video-upload',
  ),
  route(
    POST,
    '/instructor/chapters/:chapterId/lessons/document-upload',
    '/chapters/:chapterId/lessons/document-upload',
  ),
  route(
    PATCH,
    '/instructor/chapters/:chapterId/lessons/reorder',
    '/chapters/:chapterId/lessons/reorder',
  ),
  route(PATCH, '/instructor/lessons/:id', '/lessons/:id'),
  route(DELETE, '/instructor/lessons/:id', '/lessons/:id'),
  route(POST, '/instructor/lessons/:id/video-upload', '/lessons/:id/video-upload'),
  route(
    POST,
    '/instructor/lessons/:id/document-upload',
    '/lessons/:id/document-upload',
  ),
  route(
    PATCH,
    '/instructor/lessons/:id/document-settings',
    '/lessons/:id/document-settings',
  ),

  // ── instructor: progress analytics & grading ──────────────────────────
  route(GET, '/instructor/courses/:courseId/students-progress'),
  route(GET, '/instructor/courses/:courseId/students/:studentId/progress'),
  route(GET, '/instructor/grading-queue'),
  route(GET, '/instructor/grading-queue/courses'),
  route(GET, '/instructor/quiz-attempts/:attemptId'),
  route(GET, '/instructor/quiz-attempts/:attemptId/grade-history'),
  route(POST, '/instructor/quiz-attempts/:attemptId/grade'),
  route(POST, '/instructor/quiz-attempts/:attemptId/publish'),
  route(POST, '/instructor/quizzes/:quizId/publish-results'),

  // ── instructor: quiz authoring (legacy home: /admin/quizzes) ──────────
  route(GET, '/instructor/quizzes', '/admin/quizzes'),
  route(POST, '/instructor/quizzes', '/admin/quizzes'),
  route(GET, '/instructor/quizzes/:id', '/admin/quizzes/:id'),
  route(PUT, '/instructor/quizzes/:id', '/admin/quizzes/:id'),
  route(DELETE, '/instructor/quizzes/:id', '/admin/quizzes/:id'),
  route(POST, '/instructor/quizzes/:id/publish', '/admin/quizzes/:id/publish'),
  route(POST, '/instructor/quizzes/:id/versions', '/admin/quizzes/:id/versions'),
  route(GET, '/instructor/quizzes/:id/questions', '/admin/quizzes/:id/questions'),
  route(
    POST,
    '/instructor/quizzes/:quizId/questions',
    '/admin/quizzes/:quizId/questions',
  ),
  route(
    PATCH,
    '/instructor/quizzes/:quizId/questions/reorder',
    '/admin/quizzes/:quizId/questions/reorder',
  ),
  route(
    PUT,
    '/instructor/quizzes/:quizId/questions/:questionId',
    '/admin/quizzes/:quizId/questions/:questionId',
  ),
  route(
    DELETE,
    '/instructor/quizzes/:quizId/questions/:questionId',
    '/admin/quizzes/:quizId/questions/:questionId',
  ),
  route(
    POST,
    '/instructor/questions/:questionId/options',
    '/admin/questions/:questionId/options',
  ),
  route(
    PATCH,
    '/instructor/questions/:questionId/options/reorder',
    '/admin/questions/:questionId/options/reorder',
  ),
  route(PUT, '/instructor/options/:optionId', '/admin/options/:optionId'),
  route(DELETE, '/instructor/options/:optionId', '/admin/options/:optionId'),
  route(POST, '/instructor/import/lesson', '/admin/import/lesson'),
  route(POST, '/instructor/import/quiz', '/admin/import/quiz'),

  // ── admin: user management (legacy home: /users) ──────────────────────
  route(GET, '/admin/users', '/users'),
  route(POST, '/admin/users', '/users'),
  route(GET, '/admin/users/stats', '/users/stats'),
  route(GET, '/admin/users/admin-check', '/users/admin-check'),
  route(GET, '/admin/users/:id', '/users/:id'),
  route(PATCH, '/admin/users/:id', '/users/:id'),
  route(PATCH, '/admin/users/:id/role', '/users/:id/role'),
  route(PATCH, '/admin/users/:id/status', '/users/:id/status'),
];

/**
 * v1 paths that already exist natively (payments). They keep their bare
 * response shape until the web payments feature migrates, so the router
 * must leave them alone.
 */
export const NATIVE_V1_PREFIXES: readonly string[] = [
  `${API_V1_PREFIX}/admin/orders`,
  `${API_V1_PREFIX}/student/orders`,
];

const DOMAIN_PATH = new RegExp(
  `^${API_V1_PREFIX}/(public|student|me|instructor|admin)(?=/|$)`,
);

const isParam = (segment: string) => segment.startsWith(':');
const segmentsOf = (path: string) => path.split('/').slice(1);

export interface ResolvedApiV1 {
  domain: ApiDomain;
  /** Rewritten legacy path, or `undefined` when no alias matched (unknown v1 route). */
  legacyPath?: string;
}

/** Parsed once: [route, v1 segments, legacy segments]. */
const COMPILED = API_V1_ROUTES.map((entry) => ({
  entry,
  v1: segmentsOf(entry.v1),
  legacy: segmentsOf(entry.legacy),
  literals: segmentsOf(entry.v1).filter((s) => !isParam(s)).length,
}));

/**
 * Maps `/api/v1/<domain>/…` onto its legacy route. Returns `undefined` when the
 * path is not part of the v1 domain surface at all. Among matching aliases the
 * one with the most literal segments wins, so `/admin/users/stats` beats
 * `/admin/users/:id` regardless of declaration order.
 */
export function resolveApiV1(
  method: string,
  pathname: string,
): ResolvedApiV1 | undefined {
  if (NATIVE_V1_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return undefined;
  const domainMatch = DOMAIN_PATH.exec(pathname);
  if (!domainMatch) return undefined;
  const domain = domainMatch[1] as ApiDomain;

  const effectiveMethod = method === 'HEAD' ? 'GET' : method;
  const requested = segmentsOf(pathname.slice(API_V1_PREFIX.length));
  let best: (typeof COMPILED)[number] | undefined;
  let bestParams: Record<string, string> = {};
  for (const candidate of COMPILED) {
    if (!(candidate.entry.methods as readonly string[]).includes(effectiveMethod))
      continue;
    if (candidate.v1.length !== requested.length) continue;
    const params: Record<string, string> = {};
    const matches = candidate.v1.every((segment, index) => {
      const actual = requested[index];
      if (!actual) return false;
      if (isParam(segment)) {
        params[segment.slice(1)] = actual;
        return true;
      }
      return segment === actual;
    });
    if (matches && (!best || candidate.literals > best.literals)) {
      best = candidate;
      bestParams = params;
    }
  }
  if (!best) return { domain };
  const legacyPath = `/${best.legacy
    .map((segment) =>
      isParam(segment) ? (bestParams[segment.slice(1)] ?? segment) : segment,
    )
    .join('/')}`;
  return { domain, legacyPath };
}
