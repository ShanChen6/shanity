import {
  test as base,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
// Reuse the backend's existing pg driver for isolated fixture mutations only.
const requireApi = createRequire(resolve(process.cwd(), "../api/package.json"));
const { Pool } = requireApi("pg");
const db = new Pool();
const API = process.env.API_TEST_URL ?? "http://localhost:55462";
const WEB = process.env.WEB_TEST_URL ?? "http://localhost:55461";
if (
  !process.env.PGDATABASE?.endsWith("_test") ||
  process.env.AUTH_BROWSER_TEST !== "1"
)
  throw new Error("Use an isolated *_test database and AUTH_BROWSER_TEST=1");
const test = base.extend({
  context: async ({ context }, runFixture) => {
    await context.setExtraHTTPHeaders({
      "x-shanity-test-client": randomUUID(),
    });
    await runFixture(context);
  },
});
test.afterAll(async () => {
  await db.end();
});
const password = "Browser-test-password-42";
async function register(page: Page) {
  const email = `${randomUUID()}@example.invalid`;
  await page.goto("/register");
  await page
    .getByLabel("Tên hiển thị", { exact: true })
    .fill("Browser Student");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  return email;
}
async function login(page: Page, email: string, pass = password) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("register, profile update, reload, logout, login and student permissions", async ({
  page,
  context,
}) => {
  const email = await register(page);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kiểm tra quyền quản trị" }),
  ).toHaveCount(0);
  expect((await context.request.get(`${API}/users/admin-check`)).status()).toBe(
    403,
  );
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("Tên mới");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Đã cập nhật hồ sơ.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Tên hiển thị", { exact: true })).toHaveValue(
    "Tên mới",
  );
  const sibling = await context.newPage();
  await sibling.goto("/profile");
  await expect(
    sibling.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  const cookies = await context.cookies(API);
  expect(
    cookies
      .filter((c) => /access|refresh/.test(c.name))
      .every((c) => c.httpOnly),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).length + Object.keys(sessionStorage).length,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(sibling).toHaveURL(/\/login$/);
  await login(page, email);
  await expect(
    sibling.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
});

test("wrong password, duplicate email and disabled account", async ({
  page,
}) => {
  const email = await register(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, email, "wrong-password-123");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Email hoặc mật khẩu",
  );
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("Duplicate");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(
    page.getByText("Email đã được sử dụng.", { exact: false }),
  ).toBeVisible();
  await db.query("UPDATE users SET status='disabled' WHERE email=$1", [email]);
  await page.goto("/login");
  await login(page, email);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Email hoặc mật khẩu",
  );
});

test("refresh is coordinated across tabs, and revoked refresh signs out", async ({
  page,
  context,
}) => {
  const email = await register(page);
  const second = await context.newPage();
  await second.goto("/profile");
  await expect(
    second.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  await context.clearCookies({ name: "shanity_access" });
  let refreshes = 0;
  context.on("request", (req) => {
    if (req.url() === `${API}/auth/refresh`) refreshes++;
  });
  await Promise.all([page.reload(), second.reload()]);
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  await expect(
    second.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  expect(refreshes).toBe(1);
  await db.query(
    "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM users WHERE email=$1)",
    [email],
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await second.reload();
  await expect(second).toHaveURL(/\/login$/);
});

test("protected page sends anonymous visitors to login", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

async function simulateGoogle(
  context: BrowserContext,
  result: { code: string } | { error: string },
) {
  const destination = (authorizationUrl: string) => {
    const url = new URL(authorizationUrl);
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.search = new URLSearchParams({
      state: url.searchParams.get("state")!,
      ...result,
    }).toString();
    return callback.toString();
  };
  // Playwright routing is applied to the first URL in a redirect chain.
  // Preserve backend state/cookies but replace the provider hop with its test response.
  await context.route(`${API}/auth/google`, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(302);
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        location: destination(response.headers().location),
      },
      body: "",
    });
  });
  await context.route("https://accounts.google.com/**", async (route) => {
    await route.fulfill({
      status: 302,
      headers: { location: destination(route.request().url()) },
      body: "",
    });
  });
}

test("Google first/repeat login and explicit linking use the backend callback (test provider)", async ({
  page,
  context,
}) => {
  const code = randomUUID();
  await simulateGoogle(context, { code });
  await page.goto("/login");
  await page.getByRole("button", { name: "Tiếp tục với Google" }).click();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  const email = await context.request.get(`${API}/users/me`);
  const user = await email.json();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Tiếp tục với Google" }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  const linked = page.waitForResponse((response) =>
    response.url().startsWith(`${API}/auth/google/callback`),
  );
  await page.getByRole("button", { name: "Liên kết Google" }).click();
  expect((await linked).headers().location).toContain("result=linked");
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  expect((await (await context.request.get(`${API}/users/me`)).json()).id).toBe(
    user.id,
  );
});

test("Google cancellation and invalid callback show safe errors", async ({
  page,
  context,
}) => {
  await simulateGoogle(context, { error: "access_denied" });
  await page.goto("/login");
  await page.getByRole("button", { name: "Tiếp tục với Google" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Bạn đã hủy đăng nhập Google",
  );
  await page.goto(`${API}/auth/google/callback?state=invalid&code=invalid`);
  await expect(page).toHaveURL(`${WEB}/auth/callback?error=failed`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Không thể hoàn tất",
  );
});

test("pending registration cannot submit twice", async ({ page }) => {
  let requests = 0;
  await page.route(`${API}/auth/register`, async (route) => {
    requests++;
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ response });
  });
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("One submission");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.invalid`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Đang xử lý…", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("form", { name: "Đăng ký" })
    .evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  await expect(
    page.getByText("Đăng ký thành công.", { exact: false }),
  ).toBeVisible();
  expect(requests).toBe(1);
});
