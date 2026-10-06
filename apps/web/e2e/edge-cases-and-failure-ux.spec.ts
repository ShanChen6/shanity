import { expect, test, type Page } from "@playwright/test";

const COURSE = "failure-ux-course";
const ids = {
  course: "28000000-0000-4000-8000-000000000001",
  chapter: "28000000-0000-4000-8000-000000000002",
  first: "28000000-0000-4000-8000-000000000003",
  second: "28000000-0000-4000-8000-000000000004",
};
type MockLesson = { id: string; slug: string; title: string; type: "TEXT" | "VIDEO" | "DOCUMENT" };

async function mockSyllabus(page: Page, lessons: MockLesson[]) {
  await page.route(`**/public/courses/${COURSE}/syllabus`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        course: { id: ids.course, title: "Failure UX", slug: COURSE },
        instructor: null,
        curriculum: [{
          id: ids.chapter,
          title: "Resiliency",
          orderIndex: 1,
          lessons: lessons.map((lesson, index) => ({
            ...lesson,
            position: index + 1,
            isPreview: true,
          })),
        }],
      }),
    }),
  );
}

function trackUncaughtErrors(page: Page) {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  return errors;
}

test.describe("Learning failure UX resiliency", () => {
  test("EC01 shows a retry fallback when a managed video returns 404", async ({ page }) => {
    const uncaught = trackUncaughtErrors(page);
    const video = { id: ids.first, slug: "broken-video", title: "Broken video", type: "VIDEO" as const };
    await mockSyllabus(page, [video]);
    await page.route(`**/lessons/${ids.first}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...video, videoProvider: "LOCAL" }) }),
    );
    await page.route(`**/lessons/${ids.first}/video-access`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"url":"/broken-video.mp4","expiresInSeconds":3600}' }),
    );
    await page.route("**/broken-video.mp4", (route) => route.fulfill({ status: 404 }));

    await page.goto(`/learn/${COURSE}/${video.slug}`);
    const fallback = page.locator("main").getByRole("alert");
    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole("button")).toBeVisible();
    await fallback.getByRole("button").click();
    await expect(page.locator("main")).toBeVisible();
    expect(uncaught).toEqual([]);
  });

  test("EC02 replaces a missing PDF canvas with the document fallback", async ({ page }) => {
    const uncaught = trackUncaughtErrors(page);
    const document = { id: ids.first, slug: "missing-document", title: "Missing document", type: "DOCUMENT" as const };
    await mockSyllabus(page, [document]);
    await page.route(`**/lessons/${ids.first}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...document, fileName: "missing.pdf", fileType: "PDF", mimeType: "application/pdf", allowDownload: false }),
      }),
    );
    await page.route(`**/lessons/${ids.first}/document-view`, (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"Not found"}' }),
    );

    await page.goto(`/learn/${COURSE}/${document.slug}`);
    const fallback = page.locator("main").getByRole("alert");
    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole("button")).toBeVisible();
    await expect(page.getByTestId("document-lesson-renderer")).toHaveCount(0);
    expect(uncaught).toEqual([]);
  });

  test("EC03 saves the current route and redirects after a mid-session 401", async ({ page }) => {
    const uncaught = trackUncaughtErrors(page);
    const lesson = { id: ids.first, slug: "expired-session", title: "Expired session", type: "TEXT" as const };
    await mockSyllabus(page, [lesson]);
    await page.route("**/users/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: ids.second, email: "student@example.test", displayName: "Student", roles: ["student"], avatarUrl: null, hasPassword: true }),
      }),
    );
    await page.route("**/courses/*/enrollment-status", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"isEnrolled":true}' }),
    );
    await page.route(`**/lessons/${ids.first}`, (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: '{"message":"Session expired"}' }),
    );

    const currentRoute = `/learn/${COURSE}/${lesson.slug}`;
    await page.goto(currentRoute);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("shanity:learning-resume"))).toBe(currentRoute);
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encodeURIComponent(currentRoute)}`));
    expect(uncaught).toEqual([]);
  });

  test("EC04 renders a skeleton immediately while the next lesson is slow", async ({ page }) => {
    const uncaught = trackUncaughtErrors(page);
    const first = { id: ids.first, slug: "fast", title: "Fast lesson", type: "TEXT" as const };
    const second = { id: ids.second, slug: "slow", title: "Slow lesson", type: "TEXT" as const };
    await mockSyllabus(page, [first, second]);
    await page.route(`**/lessons/${ids.first}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...first, content: "Ready" }) }),
    );
    await page.route(`**/lessons/${ids.second}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...second, content: "Loaded after delay" }) });
    });

    await page.goto(`/learn/${COURSE}/${first.slug}`);
    await expect(page.getByTestId("text-lesson-renderer")).toBeVisible();
    await page.getByRole("button", { name: "Next Lesson" }).click();
    await expect(page.locator('main [role="status"]').first()).toBeVisible({ timeout: 500 });
    await expect(page.getByTestId("text-lesson-renderer")).toContainText("Loaded after delay");
    expect(uncaught).toEqual([]);
  });
});
