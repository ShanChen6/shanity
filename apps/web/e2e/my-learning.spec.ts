import { expect, test, type Page, type TestInfo } from "@playwright/test";

const PASSWORD = "Shanity-E2E-2026!";

// Shape of GET /student/enrolled-courses (EnrolledCourseDto, progress engine P5).
const courses = [
  {
    courseId: "29000000-0000-4000-8000-000000000001",
    title: "React Fundamentals",
    slug: "react-fundamentals",
    thumbnailUrl: null,
    instructorName: "Shanity Team",
    progress: {
      percentage: 72,
      completedRequiredLessons: 18,
      totalRequiredLessons: 25,
      lastAccessedLessonSlug: "react-hooks-overview",
      lastAccessedAt: "2026-10-06T10:00:00.000Z",
    },
  },
  {
    courseId: "29000000-0000-4000-8000-000000000002",
    title: "JavaScript Basics",
    slug: "javascript-basics",
    thumbnailUrl: null,
    instructorName: "Shanity Team",
    progress: {
      percentage: 45,
      completedRequiredLessons: 9,
      totalRequiredLessons: 20,
      lastAccessedLessonSlug: "closures",
      lastAccessedAt: "2026-10-05T10:00:00.000Z",
    },
  },
  {
    courseId: "29000000-0000-4000-8000-000000000003",
    title: "NestJS Fundamentals",
    slug: "nestjs-fundamentals",
    thumbnailUrl: null,
    instructorName: "Shanity Team",
    progress: {
      percentage: 18,
      completedRequiredLessons: 2,
      totalRequiredLessons: 11,
      lastAccessedLessonSlug: "modules",
      lastAccessedAt: "2026-10-04T10:00:00.000Z",
    },
  },
  {
    courseId: "29000000-0000-4000-8000-000000000004",
    title: "Git Basics",
    slug: "git-basics",
    thumbnailUrl: null,
    instructorName: null,
    progress: {
      percentage: 100,
      completedRequiredLessons: 6,
      totalRequiredLessons: 6,
      lastAccessedLessonSlug: "rebase",
      lastAccessedAt: "2026-10-01T10:00:00.000Z",
    },
  },
];

async function mockEnrolledCourses(page: Page) {
  await page.route("**/student/enrolled-courses", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(courses),
    }),
  );
}

async function registerStudent(page: Page, testInfo: TestInfo) {
  const suffix = `${testInfo.project.name}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const email = `my-learning-${suffix}@example.test`;
  await page.goto("/register");
  await page.locator("#auth-displayName").fill("Học viên Dashboard");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(PASSWORD);
  await page.locator("#auth-confirmPassword").fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  return email;
}

const card = (page: Page, title: string) =>
  page.getByRole("article", { name: title, exact: true });

test.describe("My Learning dashboard", () => {
  test("student lands on /my-learning and sees server progress per course", async ({
    page,
  }, testInfo) => {
    await mockEnrolledCourses(page);
    await registerStudent(page, testInfo);
    await expect(page).toHaveURL(/\/my-learning$/);
    await expect(
      page.getByRole("heading", { name: "Khóa học của tôi", exact: true }),
    ).toBeVisible();

    for (const [title, percent] of [
      ["React Fundamentals", "72%"],
      ["JavaScript Basics", "45%"],
      ["NestJS Fundamentals", "18%"],
    ] as const) {
      await expect(card(page, title)).toContainText(percent);
      await expect(
        card(page, title).getByRole("link", { name: /Tiếp tục học/ }),
      ).toBeVisible();
    }
    await expect(card(page, "React Fundamentals")).toContainText(
      "Đã hoàn thành 18/25 bài học bắt buộc",
    );
    await expect(card(page, "Git Basics")).toContainText("Đã hoàn thành");
    await expect(
      card(page, "Git Basics").getByRole("link", { name: "Xem lại bài học" }),
    ).toBeVisible();
  });

  test("filters and sorts persist in the URL", async ({ page }, testInfo) => {
    await mockEnrolledCourses(page);
    await registerStudent(page, testInfo);
    await expect(page).toHaveURL(/\/my-learning$/);

    await page.getByRole("tab", { name: /Đã hoàn thành/ }).click();
    await expect(page).toHaveURL(/\/my-learning\?filter=completed$/);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(card(page, "Git Basics")).toBeVisible();

    await page.getByRole("tab", { name: /Đang học/ }).click();
    await expect(page.getByRole("article")).toHaveCount(3);

    await page.getByLabel("Sắp xếp theo").selectOption("progress");
    await expect(page).toHaveURL(/sort=progress/);
    await page.reload();
    await expect(page.getByRole("tab", { name: /Đang học/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("article").first()).toHaveAccessibleName(
      "React Fundamentals",
    );
  });

  test("Tiếp tục học opens the server's last accessed lesson", async ({
    page,
  }, testInfo) => {
    await mockEnrolledCourses(page);
    await registerStudent(page, testInfo);
    await card(page, "React Fundamentals")
      .getByRole("link", { name: /Tiếp tục học/ })
      .click();
    await expect(page).toHaveURL(
      /\/learn\/react-fundamentals\/react-hooks-overview$/,
    );
  });

  test("profile stays account-only", async ({ page }, testInfo) => {
    await mockEnrolledCourses(page);
    await registerStudent(page, testInfo);
    await expect(page).toHaveURL(/\/my-learning$/);
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Hồ sơ của bạn" }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.locator('a[href^="/learn/"]')).toHaveCount(0);
    await expect(page.getByText("React Fundamentals")).toHaveCount(0);

    await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Khóa học của tôi" }),
    ).toHaveAttribute("href", "/my-learning");
    await expect(
      page.getByRole("link", { name: "Cài đặt tài khoản" }),
    ).toHaveAttribute("href", "/profile");
  });
});
