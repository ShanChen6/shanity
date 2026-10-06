import { expect, test, type Page, type TestInfo } from "@playwright/test";

const COURSE_SLUG = "javascript-co-ban-cho-nguoi-moi";
const COURSE_PATH = `/courses/${COURSE_SLUG}`;
const LEARN_PATH = `/learn/${COURSE_SLUG}`;
const API_URL = (process.env.API_TEST_URL ?? "http://localhost:4000").replace(/\/$/, "");

type Syllabus = {
  course: { id: string };
  curriculum: Array<{
    title: string;
    lessons: Array<{ id: string; slug: string; title: string; type: string }>;
  }>;
};

async function loadSyllabus(page: Page): Promise<Syllabus> {
  const response = await page.request.get(
    `${API_URL}/public/courses/${COURSE_SLUG}/syllabus`,
  );
  expect(response.status(), "L17 sample course must be seeded before E2E").toBe(200);
  return response.json() as Promise<Syllabus>;
}

async function registerStudent(page: Page, testInfo: TestInfo) {
  const suffix = `${testInfo.project.name}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const previewPath = `${LEARN_PATH}/javascript-la-gi`;
  await page.goto(`/register?redirect=${encodeURIComponent(previewPath)}`);
  await page.locator("#auth-displayName").fill("Học viên E2E");
  await page.locator("#auth-email").fill(`student-${suffix}@example.test`);
  await page.locator("#auth-password").fill("Shanity-E2E-2026!");
  await page.locator("#auth-confirmPassword").fill("Shanity-E2E-2026!");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${previewPath.replaceAll("/", "\\/")}$`));
}

test.describe("Student happy path", () => {
  test("discovers, previews, enrolls and traverses text/video/document lessons", async ({
    page,
  }, testInfo) => {
    const syllabus = await loadSyllabus(page);
    expect(syllabus.curriculum).toHaveLength(3);
    expect(syllabus.curriculum.flatMap((chapter) => chapter.lessons)).toHaveLength(9);

    await test.step("discover the published course", async () => {
      const response = await page.goto(COURSE_PATH);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          name: "JavaScript Cơ bản cho người mới",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText("Bắt đầu", { exact: true })).toBeVisible();
    });

    await test.step("open the preview text lesson as a guest", async () => {
      const previewResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/lessons/") &&
          response.request().method() === "GET" &&
          !response.url().includes("document-") &&
          !response.url().includes("video-"),
      );
      await page.goto(`${LEARN_PATH}/javascript-la-gi`);
      expect((await previewResponse).status()).toBe(200);
      await expect(page.getByTestId("lesson-renderer")).toContainText(
        "JavaScript là ngôn ngữ lập trình",
      );
      await expect(
        page.getByRole("heading", { name: "JavaScript là gì?", exact: true }).first(),
      ).toBeVisible();
    });

    await test.step("register, enroll in the free course and verify persistence", async () => {
      await registerStudent(page, testInfo);
      const enrollment = await page.request.post(
        `${API_URL}/courses/${syllabus.course.id}/enroll`,
        { headers: { Origin: new URL(page.url()).origin } },
      );
      expect(enrollment.status()).toBe(201);
      const status = await page.request.get(
        `${API_URL}/courses/${syllabus.course.id}/enrollment-status`,
      );
      expect(status.status()).toBe(200);
      expect(await status.json()).toMatchObject({ isEnrolled: true });
      await page.reload();
      await expect(page.getByTestId("lesson-renderer")).toBeVisible();
    });

    await test.step("complete the text lesson and continue to the video", async () => {
      const progress = page.getByTestId("course-progress");
      await expect(progress).toHaveText(/Tiến độ: 0%/);
      // Reading evidence: scroll the lesson body (the shell scrolls <main>).
      await page.locator("main").evaluate((main) =>
        main.scrollTo({ top: main.scrollHeight }),
      );
      await page
        .getByRole("button", { name: "Đánh dấu Hoàn thành & Sang bài tiếp theo" })
        .click();
      await expect(page).toHaveURL(`${LEARN_PATH}/setup-moi-truong`);
      const textLesson = syllabus.curriculum[0]!.lessons[0]!;
      const sidebar = page.locator("aside");
      await expect(
        sidebar.getByTestId(`lesson-status-${textLesson.id}`),
      ).toHaveAttribute("data-icon", "COMPLETED");
      // Optimistic + server-confirmed: no reload needed for the new percentage.
      await expect(progress).not.toHaveText(/Tiến độ: 0%/);
      // Persisted server-side: survives a full reload.
      await page.reload();
      await expect(
        page.locator("aside").getByTestId(`lesson-status-${textLesson.id}`),
      ).toHaveAttribute("data-icon", "COMPLETED");
      await expect(page.getByTestId("video-lesson-renderer")).toBeVisible();
      await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toBeVisible();
    });

    await test.step("move from video to the PDF document", async () => {
      const documentResponse = page.waitForResponse((response) =>
        response.url().includes("/document-view"),
      );
      await page.getByRole("button", { name: "Bài tiếp theo" }).click();
      await expect(page).toHaveURL(`${LEARN_PATH}/tai-lieu-cai-dat`);
      const pdf = await documentResponse;
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-type"]).toContain("application/pdf");
      const renderer = page.getByTestId("document-lesson-renderer");
      await expect(renderer).toBeVisible();
      await expect(renderer.locator("iframe")).toBeVisible();
    });

    await test.step("cross the chapter boundary and return", async () => {
      await page.getByRole("button", { name: "Bài tiếp theo" }).click();
      await expect(page).toHaveURL(`${LEARN_PATH}/let-const-va-var`);
      await expect(page.getByRole("heading", { name: "let, const và var" })).toBeVisible();

      await page.getByRole("button", { name: "Quay lại bài trước" }).click();
      await expect(page).toHaveURL(`${LEARN_PATH}/tai-lieu-cai-dat`);
      await expect(page.getByTestId("document-lesson-renderer")).toBeVisible();
    });

    await test.step("use the responsive curriculum navigation", async () => {
      if (testInfo.project.name.startsWith("mobile")) {
        await expect(page.getByTestId("curriculum-toggle")).toBeVisible();
        await page.getByTestId("curriculum-toggle").click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        await expect(sheet.getByRole("navigation")).toBeVisible();
      } else {
        await expect(page.locator("aside").getByRole("navigation")).toBeVisible();
        await expect(page.getByTestId("curriculum-toggle")).toBeHidden();
      }
    });
  });
});
