import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Sprint 9 essay UI on the real stack, in the desktop (1440px) and mobile
 * (375px) projects of playwright.config.ts. Prerequisites:
 *  - the API and web app running, with the database migrated;
 *  - E2E_ESSAY_QUIZ_SLUG: a PUBLISHED STANDALONE quiz that has at least one
 *    ESSAY question allowing text (TEXT_WITH_KATEX), no time limit and no
 *    attempt limit, so every run can start a fresh attempt.
 * Optional, for the instructor checks:
 *  - E2E_INSTRUCTOR_EMAIL and E2E_STAFF_PASSWORD (an instructor account).
 *
 * The student is registered on the fly; nothing else is mocked, so this also
 * covers the cookie-based session and the autosave round-trip.
 */
const SLUG = process.env.E2E_ESSAY_QUIZ_SLUG;
const INSTRUCTOR_EMAIL = process.env.E2E_INSTRUCTOR_EMAIL;
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD;
const PASSWORD = "Shanity-E2E-2026!";

test.skip(!SLUG, "E2E_ESSAY_QUIZ_SLUG is required");

async function registerAndStart(page: Page, testInfo: TestInfo) {
  const suffix = `${testInfo.project.name}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  await page.goto(`/register?redirect=${encodeURIComponent(`/quizzes/${SLUG}`)}`);
  await page.locator("#auth-displayName").fill("Học viên Essay");
  await page.locator("#auth-email").fill(`essay-${suffix}@example.test`);
  await page.locator("#auth-password").fill(PASSWORD);
  await page.locator("#auth-confirmPassword").fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/quizzes/${SLUG}$`));
  await page.getByRole("button", { name: /Bắt đầu Làm bài/ }).click();
  await expect(page).toHaveURL(new RegExp(`/quizzes/${SLUG}/attempt$`));
}

/** Moves to the first essay question of the running attempt. */
async function openEssay(page: Page) {
  const editor = page.getByRole("textbox", { name: "Câu trả lời tự luận" });
  for (let step = 0; step < 50 && !(await editor.isVisible()); step++) {
    const next = page.getByRole("button", { name: /Câu sau/ });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await expect(editor).toBeVisible();
  return editor;
}

const noHorizontalScroll = async (page: Page) =>
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    "the page must not scroll sideways",
  ).toBe(true);

test.describe("Student essay editor", () => {
  test("autosaves with a live status and renders KaTeX", async ({ page }, testInfo) => {
    await registerAndStart(page, testInfo);
    const editor = await openEssay(page);
    const status = page.getByTestId("essay-save-status");

    await editor.fill("Cho $x^2 = 4$ nên $x = \\pm 2$.");
    await expect(status).toContainText("Unsaved changes...");
    await expect(page.locator(".katex").first()).toBeVisible();
    await expect(status).toContainText(/Autosaved/, { timeout: 8000 });
    await expect(status).toHaveAttribute("data-status", "success");
    await noHorizontalScroll(page);

    // Resume: a reload brings the draft back from the server.
    await page.reload();
    await expect(await openEssay(page)).toHaveValue(/x\^2 = 4/);
  });

  test("keeps the text while offline and syncs when the network returns", async ({
    page,
    context,
  }, testInfo) => {
    await registerAndStart(page, testInfo);
    const editor = await openEssay(page);
    const status = page.getByTestId("essay-save-status");
    await editor.fill("Bản nháp đầu tiên");
    await expect(status).toContainText(/Autosaved/, { timeout: 8000 });

    await context.setOffline(true);
    await editor.fill("Gõ khi mất mạng — không được mất chữ");
    await expect(status).toContainText("Offline - Saved locally");
    await expect(status).toHaveAttribute("data-status", "offline");
    await expect(page.getByRole("alert").filter({ hasText: "Mất kết nối" })).toBeVisible();

    // Even a reload while offline keeps it: the draft lives on this device.
    const stored = await page.evaluate(() =>
      Object.entries(window.localStorage).filter(([key]) =>
        key.startsWith("shanity:essay-draft:"),
      ),
    );
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.join()).toContain("không được mất chữ");

    await context.setOffline(false);
    await expect(status).toContainText(/Autosaved/, { timeout: 15000 });
    await page.reload();
    await expect(await openEssay(page)).toHaveValue(/không được mất chữ/);
  });

  test("shows an inline error and a Retry when the server fails", async ({ page }, testInfo) => {
    await registerAndStart(page, testInfo);
    const editor = await openEssay(page);
    await page.route("**/answers/draft", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await editor.fill("Sẽ không lưu được lúc này");
    const status = page.getByTestId("essay-save-status");
    await expect(status).toContainText("Save failed. Retrying...", { timeout: 8000 });
    await expect(editor).toHaveValue("Sẽ không lưu được lúc này");

    await page.unroute("**/answers/draft");
    await status.getByRole("button", { name: "Retry" }).click();
    await expect(status).toContainText(/Autosaved/, { timeout: 8000 });
  });

  test("submits and waits for the instructor", async ({ page }, testInfo) => {
    await registerAndStart(page, testInfo);
    await (await openEssay(page)).fill("Bài làm hoàn chỉnh");
    await expect(page.getByTestId("essay-save-status")).toContainText(/Autosaved/, {
      timeout: 8000,
    });
    await page.getByRole("button", { name: "Nộp bài" }).click();
    const confirm = page.getByRole("button", { name: "Vẫn nộp bài" });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page).toHaveURL(/\/results\//);
    const banner = page.getByTestId("pending-grading");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("đang trong quá trình duyệt/công bố điểm");
    // No score anywhere while the grade is private.
    await expect(page.getByTestId("quiz-percentage")).toHaveCount(0);
    await noHorizontalScroll(page);
  });
});

test.describe("Instructor screens stay usable at every width", () => {
  test.skip(
    !INSTRUCTOR_EMAIL || !STAFF_PASSWORD,
    "E2E_INSTRUCTOR_EMAIL and E2E_STAFF_PASSWORD are required",
  );

  async function instructorLogin(page: Page) {
    await page.goto("/login?redirect=/instructor/grading");
    await page.locator("#auth-email").fill(INSTRUCTOR_EMAIL!);
    await page.locator("#auth-password").fill(STAFF_PASSWORD!);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/instructor\/grading$/);
  }

  test("the grading queue filters, collapses to cards and never overflows", async ({
    page,
  }) => {
    await instructorLogin(page);
    await expect(page.getByRole("heading", { name: "Hàng chờ chấm bài" })).toBeVisible();
    const tabs = page.getByRole("tablist", { name: "Trạng thái chấm" });
    for (const name of ["Tất cả", "Cần chấm", /Đã chấm/, "Đã công bố"])
      await expect(tabs.getByRole("tab", { name })).toBeVisible();
    // Loaded: either rows or the friendly empty state, never a blank page.
    await expect(
      page.getByTestId("grading-groups").or(page.getByTestId("grading-empty")),
    ).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("the grading workspace uses tabs on a phone and two columns on a desktop", async ({
    page,
  }, testInfo) => {
    await instructorLogin(page);
    const first = page.getByRole("link", { name: /Chấm bài|Xem lại/ }).first();
    test.skip((await first.count()) === 0, "no attempt in the queue to open");
    await first.click();
    await expect(page.getByTestId("grading-header")).toBeVisible();
    const card = page.getByRole("article").first();
    const tabs = card.getByRole("tab");
    const grading = card.getByRole("group", { name: "Chấm điểm" });
    if (testInfo.project.name.startsWith("mobile")) {
      await expect(tabs).toHaveCount(2);
      await expect(grading).toBeHidden();
      await tabs.nth(1).click();
      await expect(grading).toBeVisible();
    } else {
      await expect(tabs.first()).toBeHidden();
      await expect(grading).toBeVisible();
    }
    await noHorizontalScroll(page);
  });
});
