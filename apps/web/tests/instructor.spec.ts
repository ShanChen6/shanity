import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const requireApi = createRequire(resolve(process.cwd(), "../api/package.json"));
const { Pool } = requireApi("pg");
const sharp = requireApi("sharp");
const db = new Pool();
const API = process.env.API_TEST_URL ?? "http://localhost:55462";
const WEB = process.env.WEB_TEST_URL ?? "http://localhost:55461";
if (
  !process.env.PGDATABASE?.endsWith("_test") ||
  process.env.AUTH_BROWSER_TEST !== "1"
)
  throw new Error("Use an isolated *_test database and AUTH_BROWSER_TEST=1");
test.afterAll(() => db.end());

test("instructor creates, saves, reorders with rollback, previews and publishes", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const email = `${randomUUID()}@example.invalid`;
  const registration = await context.request.post(`${API}/auth/register`, {
    headers: { Origin: WEB },
    data: {
      email,
      password: "Instructor-test-password-42",
      displayName: "C14 Instructor",
    },
  });
  expect(registration.ok()).toBeTruthy();
  await db.query(
    "INSERT INTO user_roles(user_id,role_code) SELECT id,'instructor' FROM users WHERE email=$1",
    [email],
  );
  await page.goto("/instructor/courses");
  await expect(page.getByRole("heading", { name: "My Courses" })).toBeVisible();
  await page.getByRole("link", { name: "＋ New Course" }).last().click();
  await page.getByLabel("Tên khóa học").fill("Thiết kế giao diện");
  await expect(page.getByLabel("Slug")).toHaveValue("thiet-ke-giao-dien");
  await page.getByLabel("Slug").fill(`c14-${randomUUID()}`);
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await expect(page).toHaveURL(/\/edit\/basic$/);
  await page
    .getByLabel("Mô tả đầy đủ")
    .fill("# Học thiết kế\n- Thực hành mỗi ngày");
  const cover = await sharp({
    create: { width: 640, height: 360, channels: 3, background: "#34785e" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Ảnh bìa")
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: cover });
  await expect(
    page.getByRole("img", { name: "Ảnh bìa khóa học" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu thông tin");
  await page.getByRole("link", { name: "Đề cương", exact: true }).click();
  for (const title of ["Chương một", "Chương hai"]) {
    await page.getByLabel("Tên chương mới").fill(title);
    await page
      .getByRole("button", { name: "＋ Thêm chương", exact: true })
      .click();
    await expect(
      page.getByLabel(`Tên chương ${title}`, { exact: true }),
    ).toBeVisible();
  }
  await page.route("**/chapters/reorder", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Reorder failed" }),
    }),
  );
  await page
    .getByRole("button", { name: "Đưa chương Chương một xuống" })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Reorder failed",
  );
  await expect(
    page.locator(".instructor-chapter-header input").first(),
  ).toHaveValue("Chương một");
  await page.unroute("**/chapters/reorder");
  await page
    .getByRole("button", { name: "Đưa chương Chương một xuống" })
    .click();
  await expect(
    page.locator(".instructor-chapter-header input").first(),
  ).toHaveValue("Chương hai");
  await expect(page.getByRole("status")).toContainText("Đã lưu thứ tự mới");
  for (let i = 0; i < 2; i++) {
    const section = page.locator(".instructor-curriculum > section").nth(i);
    await section.getByRole("button", { name: "+ Add Lesson" }).click();
    await section.getByRole("menuitem", { name: "Text" }).click();
    await page.getByLabel("Tiêu đề bài học").fill(`Bài ${i + 1}`);
    await page.getByLabel(/Nội dung bài học/).fill("<p>Nội dung học tập</p>");
    await page
      .getByRole("button", { name: "Tạo bài học", exact: true })
      .click();
    await expect(section.getByText(`Bài ${i + 1}`)).toBeVisible();
  }
  await page.getByRole("link", { name: "Xem trước & xuất bản" }).click();
  await expect(
    page.getByRole("button", { name: "Xuất bản", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Xuất bản", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận" })
    .click();
  await expect(page.locator(".instructor-badge")).toHaveText("PUBLISHED");
  await page.getByRole("button", { name: "Hủy xuất bản", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận" })
    .click();
  await expect(page.locator(".instructor-badge")).toHaveText("DRAFT");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/instructor-preview-tablet.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/instructor/courses");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("heading", { name: "Thiết kế giao diện" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/instructor-courses-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Tìm kiếm").fill("no-match");
  await expect(
    page.getByRole("heading", { name: "Không có kết quả phù hợp" }),
  ).toBeVisible();
});
