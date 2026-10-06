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
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  // Students land on the learning dashboard when no ?redirect= is given.
  await expect(page).toHaveURL(`${WEB}/my-learning`);
  await expect(
    page.getByRole("heading", { name: "Khóa học của tôi" }),
  ).toBeVisible();
  await page.goto("/profile");
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

test("change password validates, clears cancellation, logs out and accepts only the new password", async ({
  page,
}) => {
  const email = await register(page);
  await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Đổi mật khẩu" });
  const current = dialog.getByLabel("Mật khẩu hiện tại", { exact: true });
  const next = dialog.getByLabel("Mật khẩu mới", { exact: true });
  const confirm = dialog.getByLabel("Xác nhận mật khẩu mới", { exact: true });
  const submit = dialog.getByRole("button", {
    name: "Đổi mật khẩu",
    exact: true,
  });
  await current.fill(password);
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();
  await expect(current).toHaveValue("");
  await current.fill(password);
  await next.fill(password);
  await confirm.fill(password);
  await submit.click();
  await expect(
    dialog.getByText("Mật khẩu mới phải khác mật khẩu hiện tại."),
  ).toBeVisible();
  const replacement = "Browser-changed-password-43";
  await next.fill(replacement);
  await submit.click();
  await expect(dialog.getByText("Mật khẩu xác nhận không khớp.")).toBeVisible();
  await confirm.fill(replacement);
  await current.fill("incorrect-password");
  await submit.click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Mật khẩu hiện tại không đúng.",
  );
  await current.fill(password);
  await submit.click();
  await expect(page).toHaveURL(/\/login\?/);
  await expect(
    page.getByText("Đổi mật khẩu thành công. Vui lòng đăng nhập lại."),
  ).toBeVisible();
  await login(page, email);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Email hoặc mật khẩu không đúng" }),
  ).toBeVisible();
  await login(page, email, replacement);
  await expect(page).toHaveURL(`${WEB}/my-learning`);
  await expect(
    page.getByRole("heading", { name: "Khóa học của tôi" }),
  ).toBeVisible();
});

test("OAuth-only profile disables change password", async ({ page }) => {
  const email = await register(page);
  await db.query("UPDATE users SET password_hash = NULL WHERE email = $1", [
    email,
  ]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Đổi mật khẩu", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Tài khoản đăng nhập bằng Google chưa có mật khẩu để thay đổi.",
    ),
  ).toBeVisible();
});

test("register, profile, reload, logout, login and student permissions", async ({
  page,
  context,
}) => {
  const email = await register(page);
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kiểm tra quyền quản trị" }),
  ).toHaveCount(0);
  expect((await context.request.get(`${API}/users/admin-check`)).status()).toBe(
    403,
  );
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa hồ sơ" }),
  ).toBeEnabled();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Browser Student", exact: true }),
  ).toBeVisible();
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
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await expect(sibling).toHaveURL(/\/login(?:\?redirect=.*)?$/);
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
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await login(page, email, "wrong-password-123");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Email hoặc mật khẩu",
  );
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("Duplicate");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
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
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await second.reload();
  await expect(second).toHaveURL(/\/login(?:\?redirect=.*)?$/);
});

test("protected page sends anonymous visitors to login", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

async function simulateGoogle(
  context: BrowserContext,
  result: { code: string } | { error: string },
) {
  const destination = (authorizationUrl: string) => {
    const url = new URL(authorizationUrl);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_secret")).toBeNull();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    expect(`${callback.origin}${callback.pathname}`).toBe(
      `${API}/auth/google/callback`,
    );
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
  const sessionCookies = (await context.cookies(API)).filter((cookie) =>
    /shanity_(access|refresh)$/.test(cookie.name),
  );
  expect(sessionCookies).toHaveLength(2);
  expect(sessionCookies.every((cookie) => cookie.httpOnly)).toBe(true);
  expect(new URL(page.url()).search).toBe("");
  const email = await context.request.get(`${API}/users/me`);
  const user = await email.json();
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await page.getByRole("button", { name: "Tiếp tục với Google" }).click();
  await expect(
    page.getByText(user.email, { exact: true }).first(),
  ).toBeVisible();
  const linked = page.waitForResponse((response) =>
    response.url().startsWith(`${API}/auth/google/callback`),
  );
  // Linking remains a backend capability; the read-only profile has no mutation action.
  const linkResponse = await context.request.post(`${API}/auth/google/link`, {
    headers: { Origin: WEB },
  });
  expect(linkResponse.ok()).toBe(true);
  await page.goto((await linkResponse.json()).url);
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
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
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

test("Google success query cannot authenticate without a backend session", async ({
  page,
}) => {
  await page.goto("/auth/callback?result=signed_in");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Không thể hoàn tất",
  );
  await expect(page).toHaveURL(/\/auth\/callback\?result=signed_in$/);
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toHaveCount(0);
});

for (const path of [
  "/dashboard",
  "/profile",
  "/my-courses",
  "/my-courses/course-1?lesson=2",
  "/my-learning",
  "/my-learning?filter=completed",
]) {
  test(`guest is redirected before rendering ${path}`, async ({ request }) => {
    const response = await request.get(`${WEB}${path}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = new URL(response.headers().location, WEB);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe(path);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
}

test("email login returns to the original path and query", async ({ page }) => {
  const email = await register(page);
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await page.goto("/my-learning?filter=in-progress&q=hello%20world");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await login(page, email);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/my-learning" &&
      url.searchParams.get("filter") === "in-progress" &&
      url.searchParams.get("q") === "hello world",
  );
  await expect(
    page.getByRole("heading", { name: "Khóa học của tôi" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Khóa học của tôi" }),
  ).toBeVisible();
});

test("Google login preserves redirect across cancellation and retry", async ({
  page,
  context,
}) => {
  await simulateGoogle(context, { error: "access_denied" });
  await page.goto("/dashboard?tab=progress");
  await page.getByRole("button", { name: "Tiếp tục với Google" }).click();
  await page.getByRole("link", { name: "Về đăng nhập" }).click();
  await expect(page).toHaveURL(
    `${WEB}/login?redirect=%2Fdashboard%3Ftab%3Dprogress`,
  );
  await context.unrouteAll();
  await simulateGoogle(context, { code: randomUUID() });
  await page.getByRole("button", { name: "Tiếp tục với Google" }).click();
  await expect(page).toHaveURL(`${WEB}/dashboard?tab=progress`);
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("shanity-google-return")),
  ).toBeNull();
});

test("forged cookie cannot render a protected page without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    extraHTTPHeaders: { "x-shanity-return-to": "https://evil.example" },
  });
  await context.addCookies([
    { name: "shanity_access", value: "forged", url: WEB, httpOnly: true },
  ]);
  const page = await context.newPage();
  await page.goto(`${WEB}/dashboard`);
  await expect(page).toHaveURL(`${WEB}/login?redirect=%2Fdashboard`);
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toHaveCount(0);
  await context.close();
});

test("student login without redirect lands on my learning", async ({
  page,
}) => {
  const email = await register(page);
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await page.goto("/login");
  await login(page, email);
  await expect(page).toHaveURL(`${WEB}/my-learning`);
  await expect(
    page.getByRole("heading", { name: "Khóa học của tôi" }),
  ).toBeVisible();
});

test("student login honors an explicit redirect", async ({ page }) => {
  const email = await register(page);
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await page.goto("/login?redirect=/courses/js-basics");
  await login(page, email);
  await expect(page).toHaveURL(`${WEB}/courses/js-basics`);
});

test("legacy /my-courses forwards to /my-learning with its query", async ({
  page,
}) => {
  await register(page);
  await page.goto("/my-courses?filter=completed");
  await expect(page).toHaveURL(`${WEB}/my-learning?filter=completed`);
});

test("external and auth-loop return URLs fall back to the role home", async ({
  page,
}) => {
  await register(page);
  for (const destination of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%252fevil.example",
    "/login",
    "/auth/callback",
    "/%6cogin",
  ]) {
    await page.goto(`/login?${new URLSearchParams({ redirect: destination })}`);
    await expect(page).toHaveURL(`${WEB}/my-learning`);
  }
});

test("revoked session is rechecked during navigation within the protected group", async ({
  page,
}) => {
  const email = await register(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  await db.query(
    "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM users WHERE email=$1)",
    [email],
  );
  await page.getByRole("link", { name: "Hồ sơ của bạn" }).click();
  await expect(page).toHaveURL(`${WEB}/login?redirect=%2Fprofile`);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("RSC requests and caller headers cannot bypass guest redirects", async ({
  request,
}) => {
  const response = await request.get(`${WEB}/dashboard?tab=progress`, {
    maxRedirects: 0,
    headers: { RSC: "1", "x-shanity-return-to": "https://evil.example" },
  });
  expect(response.status()).toBe(307);
  const location = new URL(response.headers().location, WEB);
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("redirect")).toBe("/dashboard?tab=progress");
});

test("registration retains the return URL selected on login", async ({
  page,
}) => {
  await page.goto("/dashboard?tab=welcome");
  await page.getByRole("link", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL(
    `${WEB}/register?redirect=%2Fdashboard%3Ftab%3Dwelcome`,
  );
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("New Student");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.invalid`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(page).toHaveURL(`${WEB}/dashboard?tab=welcome`);
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
});

for (const path of ["/admin", "/admin/users"]) {
  test(`admin guest redirect before render: ${path}`, async ({ request }) => {
    const response = await request.get(`${WEB}${path}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = new URL(response.headers().location, WEB);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("redirect")).toBe(
      path === "/admin" ? null : path,
    );
  });
}

async function grantAdmin(email: string) {
  await db.query(
    "INSERT INTO user_roles(user_id, role_code) SELECT id, 'admin' FROM users WHERE email=$1 ON CONFLICT DO NOTHING",
    [email],
  );
}
async function revokeAdmin(email: string) {
  await db.query(
    "DELETE FROM user_roles WHERE role_code='admin' AND user_id=(SELECT id FROM users WHERE email=$1)",
    [email],
  );
}

test("admin guard rejects student and instructor without JavaScript", async ({
  page,
  context,
  browser,
}) => {
  const email = await register(page);
  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    extraHTTPHeaders: { "x-shanity-return-to": "/profile" },
    storageState: await context.storageState(),
  });
  const direct = await noJs.newPage();
  for (const role of ["student", "instructor"]) {
    if (role === "instructor")
      await db.query(
        "INSERT INTO user_roles(user_id, role_code) SELECT id, 'instructor' FROM users WHERE email=$1",
        [email],
      );
    for (const path of ["/admin", "/admin/users"]) {
      const denied = await noJs.request.get(`${WEB}${path}`, {
        maxRedirects: 0,
      });
      expect(denied.status()).toBe(307);
      expect(new URL(denied.headers().location, WEB).pathname).toBe(
        "/forbidden",
      );
      await direct.goto(`${WEB}${path}`);
      await expect(direct).toHaveURL(`${WEB}/forbidden`);
      await expect(
        direct.getByRole("heading", { name: "Bạn không có quyền truy cập" }),
      ).toBeVisible();
      await expect(
        direct.getByRole("navigation", { name: "Điều hướng quản trị" }),
      ).toHaveCount(0);
    }
  }
  await noJs.close();
});

test("admin desktop shell, breadcrumb and mobile navigation", async ({
  page,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Khu vực quản trị" }),
  ).toBeVisible();
  const desktop = page.getByRole("complementary");
  await expect(
    desktop.getByRole("link", { name: "Trang quản trị" }),
  ).toHaveAttribute("aria-current", "page");
  await desktop.getByRole("link", { name: "Người dùng", exact: true }).click();
  await expect(page).toHaveURL(`${WEB}/admin/users`);
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Người dùng");
  await expect(
    desktop.getByRole("link", { name: "Người dùng", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Người dùng", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/shanity-admin-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(desktop).toBeHidden();
  const menu = page.getByRole("button", { name: "Mở menu quản trị" });
  await menu.click();
  const close = page.getByRole("button", { name: "Đóng menu quản trị" });
  await expect(close).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await page
    .getByRole("navigation", { name: "Điều hướng quản trị" })
    .getByRole("link", { name: "Trang quản trị" })
    .click();
  await expect(page).toHaveURL(`${WEB}/admin`);
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({
    path: "/tmp/shanity-admin-mobile.png",
    fullPage: true,
  });
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("admin permission is rechecked on navigation and after focus", async ({
  page,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Khu vực quản trị" }),
  ).toBeVisible();
  await revokeAdmin(email);
  await page.getByRole("link", { name: "Mở trang người dùng" }).click();
  await expect(page).toHaveURL(`${WEB}/forbidden`);
  await grantAdmin(email);
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "Người dùng", exact: true }),
  ).toBeVisible();
  await revokeAdmin(email);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(`${WEB}/forbidden`);
  await expect(
    page.getByRole("navigation", { name: "Điều hướng quản trị" }),
  ).toHaveCount(0);
});

test("admin login returns to the requested admin route", async ({ page }) => {
  const email = await register(page);
  await grantAdmin(email);
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(`${WEB}/admin/login?redirect=%2Fadmin%2Fusers`);
  await login(page, email);
  await expect(page).toHaveURL(`${WEB}/admin/users`);
  await expect(
    page.getByRole("heading", { name: "Người dùng", exact: true }),
  ).toBeVisible();
});

test("admin user detail preserves filters and handles missing/error states", async ({
  page,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  const result = await db.query("SELECT id FROM users WHERE email=$1", [email]);
  const id = result.rows[0].id;
  const listPath = `/admin/users?search=${encodeURIComponent(email)}`;
  await page.goto(listPath);
  await page
    .getByRole("link", { name: "Xem chi tiết Browser Student" })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Chi tiết người dùng" }),
  ).toBeVisible();
  await expect(page.locator("dd").filter({ hasText: email })).toBeVisible();
  await expect(page.locator("dd").filter({ hasText: id })).toBeVisible();
  // Profile remains a read view until the edit dialog is opened.
  await expect(
    page.locator("main input:visible, main textarea:visible"),
  ).toHaveCount(0);
  await expect(page.locator("time").first()).toHaveAttribute("datetime", /T/);
  await page.reload();
  await expect(page.locator("dd").filter({ hasText: email })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Quay lại danh sách" }).click();
  await expect(page.getByLabel("Tìm theo tên hoặc email")).toHaveValue(email);
  await page.goto(`/admin/users/${randomUUID()}`);
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy người dùng" }),
  ).toBeVisible();
  await page.route(`${API}/users/${id}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Test error" }),
    }),
  );
  await page.goto(`/admin/users/${id}`);
  await expect(
    page.getByRole("heading", { name: "Không thể tải thông tin người dùng" }),
  ).toBeVisible();
  await page.unroute(`${API}/users/${id}`);
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.locator("dd").filter({ hasText: email })).toBeVisible();
});

test("admin role change requires confirmation, supports cancel and persists", async ({
  page,
  context,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  const target = await db.query(
    "INSERT INTO users(email, display_name) VALUES ($1, $2) RETURNING id",
    [`${randomUUID()}@example.invalid`, "Role Target"],
  );
  const id = target.rows[0].id;
  await db.query(
    "INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'student')",
    [id],
  );
  let mutations = 0;
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().endsWith(`/users/${id}/role`))
      mutations++;
  });
  await page.goto(`/admin/users/${id}`);
  await page.getByLabel("Vai trò mới").selectOption("INSTRUCTOR");
  await page
    .getByRole("button", { name: "Thay đổi vai trò", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Hủy", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await expect(dialog).toContainText("Giảng viên");
  expect(mutations).toBe(0);
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(mutations).toBe(0);
  await page
    .getByRole("button", { name: "Thay đổi vai trò", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Thay đổi vai trò", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Xác nhận đổi vai trò", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Đã cập nhật vai trò.");
  expect(mutations).toBe(1);
  expect(
    (await (await context.request.get(`${API}/users/${id}`)).json()).roles,
  ).toEqual(["instructor"]);
  await page.reload();
  await expect(
    page.locator("dd").filter({ hasText: "Giảng viên" }),
  ).toBeVisible();
  await page.getByLabel("Vai trò mới").selectOption("ADMIN");
  await page.route(`${API}/users/${id}/role`, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "Role change blocked" }),
    }),
  );
  await page
    .getByRole("button", { name: "Thay đổi vai trò", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Xác nhận đổi vai trò", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText("Role change blocked");
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await page.unroute(`${API}/users/${id}/role`);
  const me = await (await context.request.get(`${API}/users/me`)).json();
  await page.goto(`/admin/users/${me.id}`);
  await expect(
    page.getByLabel("Vai trò mới").locator('option[value="STUDENT"]'),
  ).toHaveJSProperty("disabled", true);
  await expect(
    page.getByLabel("Vai trò mới").locator('option[value="INSTRUCTOR"]'),
  ).toHaveJSProperty("disabled", true);
});

test("admin account status confirms disable/activate and preserves account data", async ({
  page,
  context,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  const targetEmail = `${randomUUID()}@example.invalid`;
  const target = await db.query(
    "INSERT INTO users(email, display_name) VALUES ($1, $2) RETURNING id",
    [targetEmail, "Status Target"],
  );
  const id = target.rows[0].id;
  await db.query(
    "INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'student')",
    [id],
  );
  let mutations = 0;
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().endsWith(`/users/${id}/status`))
      mutations++;
  });
  await page.goto(`/admin/users/${id}`);
  await page
    .getByRole("button", { name: "Vô hiệu hóa tài khoản", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(targetEmail);
  await expect(
    dialog.getByRole("button", { name: "Hủy", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(mutations).toBe(0);
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  expect(mutations).toBe(0);
  await page
    .getByRole("button", { name: "Vô hiệu hóa tài khoản", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Đã vô hiệu hóa tài khoản.",
  );
  expect(mutations).toBe(1);
  await expect(page.locator("dd").filter({ hasText: "Đã khóa" })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Kích hoạt tài khoản", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Đã kích hoạt tài khoản.");
  const updated = await (
    await context.request.get(`${API}/users/${id}`)
  ).json();
  expect(updated.status).toBe("active");
  expect(updated.roles).toEqual(["student"]);
  expect(updated.email).toBe(targetEmail);
  await page.route(`${API}/users/${id}/status`, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "Không thể vô hiệu hóa tài khoản này." }),
    }),
  );
  await page
    .getByRole("button", { name: "Vô hiệu hóa tài khoản", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Không thể vô hiệu hóa tài khoản này.",
  );
  await page.keyboard.press("Escape");
  await page.unroute(`${API}/users/${id}/status`);
  const me = await (await context.request.get(`${API}/users/me`)).json();
  await page.goto(`/admin/users/${me.id}`);
  await expect(
    page.getByRole("button", { name: "Vô hiệu hóa tài khoản", exact: true }),
  ).toBeDisabled();
});

test("admin overview uses aggregate statistics and handles loading, retry and zero counts", async ({
  page,
  context,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  const expected = await (
    await context.request.get(`${API}/users/stats`)
  ).json();
  let listRequests = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/users") listRequests++;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${API}/users/stats`, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("status", { name: "Đang tải thống kê người dùng" }),
  ).toBeVisible();
  release();
  const overview = page.getByRole("region", {
    name: "Thống kê người dùng",
    exact: true,
  });
  await expect(overview).toBeVisible();
  const labels: Record<string, string> = {
    totalUsers: "Tổng người dùng",
    students: "Học sinh",
    instructors: "Giảng viên",
    admins: "Quản trị viên",
    activeUsers: "Người dùng hoạt động",
  };
  for (const [key, label] of Object.entries(labels)) {
    await expect(
      overview
        .locator("div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd"),
    ).toHaveText(new Intl.NumberFormat("vi-VN").format(expected[key]));
  }
  expect(listRequests).toBe(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.unroute(`${API}/users/stats`);
  await page.route(`${API}/users/stats`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unavailable" }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Không thể tải thống kê người dùng" }),
  ).toBeVisible();
  await expect(overview).toHaveCount(0);
  await page.unroute(`${API}/users/stats`);
  await page.route(`${API}/users/stats`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalUsers: 0,
        students: 0,
        instructors: 0,
        admins: 0,
        activeUsers: 0,
      }),
    }),
  );
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(overview.locator("dd")).toHaveText(["0", "0", "0", "0", "0"]);
  expect(listRequests).toBe(0);
});

test("admin UX pagination, empty states and long text remain accessible", async ({
  page,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  const prefix = randomUUID();
  const longName = `${prefix}${"N".repeat(64)}`;
  for (let index = 0; index < 23; index++) {
    await db.query("INSERT INTO users(email, display_name) VALUES ($1, $2)", [
      `${prefix}-${index}@${"d".repeat(60)}.${"e".repeat(60)}.invalid`,
      longName,
    ]);
  }
  await page.goto(`/admin/users?search=${prefix}`);
  await expect(
    page.getByText("Hiển thị 1–20 trong 23 tài khoản."),
  ).toBeVisible();
  const topPagination = page.getByRole("navigation", {
    name: "Phân trang người dùng, đầu danh sách",
  });
  await expect(topPagination.getByText("Trang trước")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await topPagination.getByRole("link", { name: "Trang sau" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Hiển thị 21–23 trong 23 tài khoản."),
  ).toBeVisible();
  await expect(page.locator("#admin-user-results")).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`search=${prefix}.*page=2|page=2.*search=${prefix}`),
  );
  await expect(topPagination.getByText("Trang sau")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.setViewportSize({ width: 768, height: 900 });
  const table = page.getByRole("region", {
    name: "Bảng người dùng, cuộn ngang để xem đầy đủ",
  });
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => table.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          viewport: innerWidth,
        })),
      )
      .toEqual({ document: width, viewport: width });
  }
  await page
    .getByRole("link", { name: `Xem chi tiết ${longName}`, exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: longName, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByText("Chi tiết người dùng")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await breadcrumb
    .getByRole("link", { name: "Người dùng", exact: true })
    .click();
  await expect(
    page.getByText("Hiển thị 21–23 trong 23 tài khoản."),
  ).toBeVisible();
  await page.getByLabel("Tìm theo tên hoặc email").fill(`${prefix}-no-match`);
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy tài khoản phù hợp" }),
  ).toBeVisible();
  await expect(page.locator("#admin-user-results")).toBeFocused();
  await page.goto(`/admin/users?search=${prefix}&page=99`);
  await expect(
    page.getByRole("heading", { name: "Trang này không còn kết quả" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Về trang đầu", exact: true }).click();
  await expect(
    page.getByText("Hiển thị 1–20 trong 23 tài khoản."),
  ).toBeVisible();
  await page.route(`${API}/users?**`, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Forbidden" }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Bạn không có quyền xem danh sách tài khoản",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại" })).toHaveCount(0);
  await page.unroute(`${API}/users?**`);
});

test("admin UX dialog focus, pending guard, toast and mobile menu", async ({
  page,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  const target = await db.query(
    "INSERT INTO users(email, display_name) VALUES ($1, $2) RETURNING id",
    [`${randomUUID()}@example.invalid`, "Focus Target"],
  );
  const id = target.rows[0].id;
  await db.query(
    "INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'student')",
    [id],
  );
  await page.goto(`/admin/users/${id}`);
  await page.getByLabel("Vai trò mới").selectOption("INSTRUCTOR");
  const trigger = page.getByRole("button", {
    name: "Thay đổi vai trò",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Hủy", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Hủy", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route(`${API}/users/${id}/role`, async (route) => {
    writes++;
    await gate;
    await route.continue();
  });
  await trigger.click();
  await dialog
    .getByRole("button", { name: "Xác nhận đổi vai trò", exact: true })
    .click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Hủy", exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.getByRole("status")).toHaveText("Đã cập nhật vai trò.");
  expect(writes).toBe(1);
  await expect(page.getByLabel("Vai trò mới")).toBeFocused();
  await page.getByRole("button", { name: "Đóng thông báo" }).click();
  await expect(
    page.getByRole("region", { name: "Thông báo quản trị" }),
  ).toHaveCount(0);
  await expect(page.locator("#admin-content")).toBeFocused();
  await page.unroute(`${API}/users/${id}/role`);
  await page.route(`${API}/users/${id}/role`, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "Không thể đổi vai trò." }),
    }),
  );
  await page.getByLabel("Vai trò mới").selectOption("ADMIN");
  await trigger.click();
  await dialog
    .getByRole("button", { name: "Xác nhận đổi vai trò", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  const toggle = page.getByRole("button", { name: "Mở menu quản trị" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  const mobile = page.locator("#admin-mobile-navigation");
  await expect(mobile).toBeVisible();
  await mobile.getByRole("link", { name: "Người dùng", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(mobile).toBeHidden();
  await toggle.click();
  await mobile.getByRole("link", { name: "Người dùng", exact: true }).focus();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#admin-content")).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(mobile).toBeHidden();
});

test("admin login has a separate public UI and rejects invalid credentials", async ({
  page,
  request,
}) => {
  const response = await request.get(`${WEB}/admin/login`, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  await page.goto("/admin/login");
  await expect(
    page.getByRole("heading", { name: "Đăng nhập quản trị" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Tạo tài khoản|Đăng ký/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Tiếp tục với Google" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Điều hướng quản trị" }),
  ).toHaveCount(0);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await login(
    page,
    `${randomUUID()}@example.invalid`,
    "Wrong-but-long-password",
  );
  await expect(
    page.getByRole("form", { name: "Đăng nhập quản trị" }).getByRole("alert"),
  ).toContainText("Email hoặc mật khẩu không đúng");
  await expect(page).toHaveURL(`${WEB}/admin/login`);
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveValue("");
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Cùng học tiếp nhé!" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tiếp tục với Google" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Tạo tài khoản" })).toBeVisible();
});

for (const role of ["student", "instructor"]) {
  test(`admin login denies ${role} and backend admin APIs remain forbidden`, async ({
    page,
    context,
  }) => {
    const email = await register(page);
    if (role === "instructor")
      await db.query(
        "INSERT INTO user_roles(user_id, role_code) SELECT id, 'instructor' FROM users WHERE email=$1",
        [email],
      );
    await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    await page.goto("/admin/login");
    await login(page, email);
    await expect(
      page.getByRole("form", { name: "Đăng nhập quản trị" }).getByRole("alert"),
    ).toContainText("Tài khoản này không có quyền quản trị");
    await expect(page).toHaveURL(`${WEB}/admin/login`);
    const me = await (await context.request.get(`${API}/users/me`)).json();
    for (const path of ["/users", "/users/stats", `/users/${me.id}`])
      expect((await context.request.get(`${API}${path}`)).status()).toBe(403);
    for (const [path, data] of [
      [`/users/${me.id}/role`, { role: "ADMIN" }],
      [`/users/${me.id}/status`, { status: "ACTIVE" }],
    ] as const) {
      expect(
        (
          await context.request.patch(`${API}${path}`, {
            headers: { Origin: WEB },
            data,
          })
        ).status(),
      ).toBe(403);
    }
    for (const path of ["/admin", "/admin/users"]) {
      const response = await context.request.get(`${WEB}${path}`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers().location, WEB).pathname).toBe(
        "/forbidden",
      );
    }
    await page.goto("/admin");
    await expect(page).toHaveURL(`${WEB}/forbidden`);
  });
}

test("admin login restores shared refresh sessions, validates return URLs and logs out to admin", async ({
  page,
  context,
}) => {
  const email = await register(page);
  await grantAdmin(email);
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.goto("/admin/login");
  await login(page, email);
  await expect(page).toHaveURL(`${WEB}/admin`);
  await expect(
    page.getByRole("heading", { name: "Khu vực quản trị" }),
  ).toBeVisible();
  const response = await context.request.get(`${WEB}/admin/login`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location, WEB).pathname).toBe("/admin");
  for (const redirect of [
    "https://evil.invalid",
    "//evil.invalid",
    "/admin/login",
    "/admin/%6cogin",
    "/admin/..%2fprofile",
  ]) {
    const response = await context.request.get(
      `${WEB}/admin/login?${new URLSearchParams({ redirect })}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location, WEB).href).toBe(`${WEB}/admin`);
  }
  await page.goto("/admin/login");
  await expect(page).toHaveURL(`${WEB}/admin`);
  await page.goto("/admin/users");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Người dùng", exact: true }),
  ).toBeVisible();
  const jar = await context.cookies();
  await context.clearCookies();
  await context.addCookies(
    jar.filter((cookie) => !cookie.name.endsWith("shanity_access")),
  );
  await page.goto("/admin/users?search=retained&role=student");
  await expect(page).toHaveURL(
    `${WEB}/admin/users?search=retained&role=student`,
  );
  await expect(page.getByLabel("Tìm theo tên hoặc email")).toHaveValue(
    "retained",
  );
  const refreshed = await context.cookies();
  expect(
    refreshed.some(
      (cookie) => cookie.name === "shanity_access" && cookie.httpOnly,
    ),
  ).toBe(true);
  expect(refreshed.some((cookie) => /admin.*token/i.test(cookie.name))).toBe(
    false,
  );
  const sibling = await context.newPage();
  await sibling.goto("/admin");
  await expect(
    sibling.getByRole("heading", { name: "Khu vực quản trị" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Đăng xuất quản trị", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/login(?:\?.*)?$/);
  await expect(sibling).toHaveURL(/\/admin\/login(?:\?.*)?$/);
  await expect(
    page.getByRole("heading", { name: "Đăng nhập quản trị" }),
  ).toBeVisible();
  expect(
    (await context.cookies()).some((cookie) =>
      /shanity_(access|refresh)$/.test(cookie.name),
    ),
  ).toBe(false);
});

test("admin user CRUD creates, edits and disables without deleting data", async ({
  page,
  context,
  browser,
}) => {
  const actorEmail = await register(page);
  await grantAdmin(actorEmail);
  await page.goto("/admin/users");
  const actor = await (await context.request.get(`${API}/users/me`)).json();
  const createdEmail = `${randomUUID()}@example.invalid`;
  await page
    .getByRole("button", { name: "Thêm người dùng", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Tên hiển thị", { exact: true })
    .fill("Created by Admin");
  await dialog.getByLabel("Email", { exact: true }).fill(createdEmail);
  await dialog.getByLabel("Mật khẩu ban đầu").fill(password);
  await dialog
    .getByLabel("Vai trò", { exact: true })
    .selectOption("INSTRUCTOR");
  await dialog.getByRole("button", { name: "Xác nhận tạo" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("heading", { name: "Created by Admin", exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const detail = await (await context.request.get(`${API}/users/${id}`)).json();
  expect(detail.roles).toEqual(["instructor"]);
  expect(detail.status).toBe("active");
  expect(detail.password_hash).toBeUndefined();
  expect((await (await context.request.get(`${API}/users/me`)).json()).id).toBe(
    actor.id,
  );
  const row = await db.query("SELECT password_hash FROM users WHERE id=$1", [
    id,
  ]);
  expect(row.rows[0].password_hash).not.toBe(password);

  await page
    .getByRole("button", { name: "Sửa thông tin", exact: true })
    .click();
  await dialog.getByLabel("Tên hiển thị", { exact: true }).fill("Discard this");
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sửa thông tin", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Created by Admin", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sửa thông tin", exact: true })
    .click();
  await dialog.getByLabel("Email", { exact: true }).fill(actorEmail);
  await dialog.getByRole("button", { name: "Xác nhận lưu" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Email đã được sử dụng",
  );
  const newEmail = `${randomUUID()}@example.invalid`;
  await dialog.getByLabel("Email", { exact: true }).fill(newEmail);
  await dialog
    .getByLabel("Tên hiển thị", { exact: true })
    .fill("Edited by Admin");
  await dialog.getByRole("button", { name: "Xác nhận lưu" }).click();
  await expect(
    page.getByRole("heading", { name: "Edited by Admin", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(newEmail, { exact: true }).first()).toBeVisible();
  const updated = await (
    await context.request.get(`${API}/users/${id}`)
  ).json();
  expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
    new Date(detail.updatedAt).getTime(),
  );
  expect(updated.roles).toEqual(["instructor"]);

  const member = await browser.newContext();
  const signedIn = await member.request.post(`${API}/auth/login`, {
    headers: { Origin: WEB },
    data: { email: newEmail, password },
  });
  expect(signedIn.status()).toBe(200);
  await page
    .getByRole("button", { name: "Vô hiệu hóa tài khoản", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Kích hoạt tài khoản", exact: true }),
  ).toBeVisible();
  expect((await member.request.get(`${API}/users/me`)).status()).toBe(401);
  expect(
    (await db.query("SELECT status FROM users WHERE id=$1", [id])).rows[0]
      .status,
  ).toBe("disabled");
  await member.close();
});

test("admin user CRUD API rejects unauthorized, invalid and conflicting writes", async ({
  page,
  context,
  browser,
}) => {
  const email = await register(page);
  const me = await (await context.request.get(`${API}/users/me`)).json();
  const data = {
    email: `${randomUUID()}@example.invalid`,
    displayName: "New user",
    password,
    role: "STUDENT",
  };
  const headers = { Origin: WEB };
  const guest = await browser.newContext();
  expect(
    (await guest.request.post(`${API}/users`, { headers, data })).status(),
  ).toBe(401);
  expect(
    (
      await guest.request.patch(`${API}/users/${me.id}`, {
        headers,
        data: { email, displayName: "No" },
      })
    ).status(),
  ).toBe(401);
  await guest.close();
  for (const role of ["student", "instructor"]) {
    if (role === "instructor")
      await db.query(
        "INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'instructor')",
        [me.id],
      );
    expect(
      (await context.request.post(`${API}/users`, { headers, data })).status(),
    ).toBe(403);
    expect(
      (
        await context.request.patch(`${API}/users/${me.id}`, {
          headers,
          data: { email, displayName: "No" },
        })
      ).status(),
    ).toBe(403);
  }
  await grantAdmin(email);
  expect(
    (
      await context.request.post(`${API}/users`, {
        headers: { Origin: "https://evil.invalid" },
        data,
      })
    ).status(),
  ).toBe(403);
  for (const invalid of [
    { role: "ROOT" },
    { password: "short" },
    { email: "bad" },
    { displayName: "   " },
    { status: "disabled" },
    { password_hash: "injected" },
  ]) {
    expect(
      (
        await context.request.post(`${API}/users`, {
          headers,
          data: { ...data, ...invalid },
        })
      ).status(),
    ).toBe(400);
  }
  const result = await context.request.post(`${API}/users`, {
    headers,
    data: { ...data, email: `  ${data.email.toUpperCase()}  ` },
  });
  expect(result.status()).toBe(201);
  const created = await result.json();
  expect(created.email).toBe(data.email);
  expect(created.roles).toEqual(["student"]);
  expect(Object.keys(created).sort()).toEqual(
    [
      "id",
      "email",
      "displayName",
      "roles",
      "status",
      "createdAt",
      "updatedAt",
    ].sort(),
  );
  expect(
    (await context.request.post(`${API}/users`, { headers, data })).status(),
  ).toBe(409);
  for (const extra of [
    { role: "ADMIN" },
    { status: "disabled" },
    { password: "changed-password" },
  ]) {
    expect(
      (
        await context.request.patch(`${API}/users/${created.id}`, {
          headers,
          data: { email: data.email, displayName: "No", ...extra },
        })
      ).status(),
    ).toBe(400);
  }
  expect(
    (
      await context.request.patch(`${API}/users/${randomUUID()}`, {
        headers,
        data: { email: data.email, displayName: "No" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await context.request.patch(`${API}/users/not-a-uuid`, {
        headers,
        data: { email: data.email, displayName: "No" },
      })
    ).status(),
  ).toBe(400);
  // The pre-existing static profile endpoint must win over PATCH /users/:id.
  expect(
    (
      await context.request.patch(`${API}/users/me`, {
        headers,
        data: { displayName: "Still me" },
      })
    ).status(),
  ).toBe(200);
  const admin = await context.request.post(`${API}/users`, {
    headers,
    data: { ...data, email: `${randomUUID()}@example.invalid`, role: "ADMIN" },
  });
  expect(admin.status()).toBe(201);
  expect((await admin.json()).roles).toEqual(["admin"]);
});

for (const width of [375, 768, 1024, 1440]) {
  test(`profile fits ${width}px and account menu supports keyboard`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await register(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Đổi mật khẩu" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Tải ảnh đại diện" }),
    ).toBeEnabled();
    const menu = page.getByLabel("Mở menu tài khoản", { exact: true });
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("link", { name: "Hồ sơ", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Hồ sơ", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await expect(
      page.getByRole("link", { name: "Hồ sơ", exact: true }),
    ).toBeHidden();
  });
}

test("profile handles missing current-user data and recovers", async ({
  page,
}) => {
  await register(page);
  await page.route(`${API}/users/me`, (route) => route.fulfill({ json: {} }));
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toHaveCount(0);
  await page.unroute(`${API}/users/me`);
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
});

for (const failure of ["network", "server"]) {
  test(`profile recovers from ${failure} failure`, async ({ page }) => {
    await register(page);
    await page.route(`${API}/users/me`, (route) =>
      failure === "network"
        ? route.abort()
        : route.fulfill({ status: 500, json: {} }),
    );
    await page.reload();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      failure === "network" ? "Không thể kết nối" : "Máy chủ đang gặp sự cố",
    );
    await page.unroute(`${API}/users/me`);
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(
      page.getByRole("heading", { name: "Hồ sơ của bạn" }),
    ).toBeVisible();
  });
}

test("instructor login defaults to profile and restores identity without flicker", async ({
  page,
}) => {
  const email = await register(page);
  await db.query(
    "INSERT INTO user_roles(user_id, role_code) SELECT id, 'instructor' FROM users WHERE email=$1",
    [email],
  );
  await page.getByLabel("Mở menu tài khoản", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.goto("/login");
  await login(page, email);
  // Instructors keep landing on their portal; the profile is opened explicitly.
  await expect(page).toHaveURL(`${WEB}/instructor/courses`);
  await page.goto("/profile");
  await expect(page.getByText("Giảng viên", { exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${API}/users/me`, async (route) => {
    await gate;
    await route.continue();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toHaveCount(0);
  await expect(page.getByText("Guest", { exact: true })).toHaveCount(0);
  release();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ của bạn" }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
});

for (const width of [375, 768, 1024, 1440]) {
  test(`edit profile saves and persists at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const email = await register(page);
    const sibling = await context.newPage();
    await sibling.goto("/profile");
    await expect(
      sibling.getByRole("heading", { name: "Browser Student", exact: true }),
    ).toBeVisible();
    const trigger = page.getByRole("button", {
      name: "Chỉnh sửa hồ sơ",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const name = dialog.getByLabel("Tên hiển thị", { exact: true });
    const save = dialog.getByRole("button", {
      name: "Lưu thay đổi",
      exact: true,
    });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue("Browser Student");
    await expect(save).toBeDisabled();
    await expect(dialog.getByLabel("Email đăng nhập")).toHaveValue(email);
    await expect(dialog.getByLabel("Email đăng nhập")).toHaveAttribute(
      "readonly",
      "",
    );
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await name.fill("Discard me");
    await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(name).toHaveValue("Browser Student");
    await name.fill("   ");
    await save.click();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toBeFocused();
    await name.fill("x".repeat(101));
    await save.click();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await name.fill("  Nguyễn Minh Anh  ");
    let writes = 0;
    await page.route(`${API}/users/me`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      writes++;
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ response });
    });
    await save.click();
    await expect(
      dialog.getByRole("button", { name: "Đang lưu…" }),
    ).toBeDisabled();
    await dialog.getByRole("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(writes).toBe(1);
    await expect(
      page.getByText("Đã cập nhật hồ sơ.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nguyễn Minh Anh", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Tài khoản" }),
    ).toContainText("Nguyễn Minh Anh");
    await expect(
      sibling.getByRole("heading", { name: "Nguyễn Minh Anh", exact: true }),
    ).toBeVisible();
    expect(
      (await db.query("SELECT display_name FROM users WHERE email=$1", [email]))
        .rows[0].display_name,
    ).toBe("Nguyễn Minh Anh");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Nguyễn Minh Anh", exact: true }),
    ).toBeVisible();
  });
}

for (const failure of [400, 409, 500, "network"] as const) {
  test(`edit profile retains input after ${failure} and retries`, async ({
    page,
  }) => {
    await register(page);
    await page
      .getByRole("button", { name: "Chỉnh sửa hồ sơ", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const name = dialog.getByLabel("Tên hiển thị", { exact: true });
    await name.fill("Keep this draft");
    await page.route(`${API}/users/me`, (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      return failure === "network"
        ? route.abort()
        : route.fulfill({
            status: failure,
            json: { message: "private backend exception" },
          });
    });
    await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
    if (failure === 400)
      await expect(name).toHaveAttribute("aria-invalid", "true");
    else await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog).not.toContainText("private backend exception");
    await expect(name).toHaveValue("Keep this draft");
    await page.unroute(`${API}/users/me`);
    await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Keep this draft", exact: true }),
    ).toBeVisible();
  });
}

test("self profile API rejects guests, protected fields and other account IDs", async ({
  page,
  context,
  browser,
}) => {
  const email = await register(page);
  const guest = await browser.newContext();
  const headers = { Origin: WEB };
  expect(
    (
      await guest.request.patch(`${API}/users/me`, {
        headers,
        data: { displayName: "Guest" },
      })
    ).status(),
  ).toBe(401);
  const otherEmail = `${randomUUID()}@example.invalid`;
  expect(
    (
      await guest.request.post(`${API}/auth/register`, {
        headers,
        data: { email: otherEmail, password, displayName: "Other user" },
      })
    ).status(),
  ).toBe(201);
  const other = await (await guest.request.get(`${API}/users/me`)).json();
  const me = await (await context.request.get(`${API}/users/me`)).json();
  const before = (
    await db.query("SELECT * FROM users WHERE id = ANY($1::uuid[])", [
      [me.id, other.id],
    ])
  ).rows;
  for (const extra of [
    { role: "ADMIN" },
    { roles: ["admin"] },
    { status: "disabled" },
    { id: other.id },
    { userId: other.id },
    { email: otherEmail },
    { password },
    { passwordHash: "hash" },
    { password_hash: "hash" },
    { createdAt: "2000-01-01" },
    { updatedAt: "2000-01-01" },
    { created_at: "2000-01-01" },
    { update_at: "2000-01-01" },
    { permissions: ["admin"] },
    { provider: "google" },
    { providerId: "other" },
  ]) {
    expect(
      (
        await context.request.patch(`${API}/users/me`, {
          headers,
          data: { displayName: "Attempted overwrite", ...extra },
        })
      ).status(),
    ).toBe(400);
  }
  for (const data of [
    {},
    { displayName: null },
    { displayName: 42 },
    { displayName: "   " },
    { displayName: "x".repeat(101) },
  ]) {
    expect(
      (
        await context.request.patch(`${API}/users/me`, { headers, data })
      ).status(),
    ).toBe(400);
  }
  expect(
    (
      await db.query("SELECT * FROM users WHERE id = ANY($1::uuid[])", [
        [me.id, other.id],
      ])
    ).rows,
  ).toEqual(before);
  expect(
    (await (await context.request.get(`${API}/users/me`)).json()).roles,
  ).toEqual(["student"]);
  expect(
    (
      await context.request.patch(`${API}/users/${other.id}`, {
        headers,
        data: { displayName: "Attack", email: otherEmail },
      })
    ).status(),
  ).toBe(403);
  const saved = await context.request.patch(`${API}/users/me`, {
    headers,
    data: { displayName: "  Own name  " },
  });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({
    id: me.id,
    displayName: "Own name",
    email,
    roles: ["student"],
  });
  expect(
    (await db.query("SELECT display_name FROM users WHERE id=$1", [other.id]))
      .rows[0].display_name,
  ).toBe("Other user");
  await guest.close();
});

test("expired session cannot save profile and returns to login", async ({
  page,
}) => {
  const email = await register(page);
  await page
    .getByRole("button", { name: "Chỉnh sửa hồ sơ", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Tên hiển thị", { exact: true })
    .fill("Should not save");
  await db.query(
    "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM users WHERE email=$1)",
    [email],
  );
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fprofile$/);
  expect(
    (await db.query("SELECT display_name FROM users WHERE email=$1", [email]))
      .rows[0].display_name,
  ).toBe("Browser Student");
});

test("an older session read cannot overwrite a saved profile name", async ({
  page,
}) => {
  await register(page);
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route(`${API}/users/me`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    captured();
    await gate;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await ready;
  await page
    .getByRole("button", { name: "Chỉnh sửa hồ sơ", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Tên hiển thị", { exact: true })
    .fill("Latest saved name");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(
    page.getByRole("heading", { name: "Latest saved name", exact: true }),
  ).toBeVisible();
  const staleResponse = page.waitForResponse(
    (response) =>
      response.url() === `${API}/users/me` &&
      response.request().method() === "GET",
  );
  release();
  await staleResponse;
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Latest saved name", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Tài khoản" }),
  ).toContainText("Latest saved name");
});

const makeAvatarImage = async (background: string) => {
  const sharp = requireApi("sharp");
  return (await sharp({
    create: { width: 64, height: 64, channels: 3, background },
  })
    .png()
    .toBuffer()) as Buffer;
};

for (const width of [375, 768, 1024, 1440]) {
  test(`avatar preview, replace, remove and synchronization at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const email = await register(page);
    const sibling = await context.newPage();
    await sibling.goto("/profile");
    await expect(
      sibling.getByRole("heading", { name: "Hồ sơ của bạn" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tải ảnh đại diện", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Ảnh đại diện",
      exact: true,
    });
    const picker = dialog.getByLabel("Chọn ảnh");
    const firstFile = {
      name: "photo.png",
      mimeType: "image/png",
      buffer: await makeAvatarImage("#0066dd"),
    };
    await picker.setInputFiles(firstFile);
    await expect(dialog.getByAltText("Xem trước ảnh đại diện")).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Tải ảnh đại diện", exact: true }),
    ).toBeFocused();
    expect(
      (await (await context.request.get(`${API}/users/me`)).json()).avatarUrl,
    ).toBeNull();
    await page
      .getByRole("button", { name: "Tải ảnh đại diện", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Tải ảnh lên" }),
    ).toBeDisabled();
    await picker.setInputFiles(firstFile);
    const uploaded = page.waitForResponse(
      (res) =>
        res.url() === `${API}/users/me/avatar` &&
        res.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Tải ảnh lên" }).click();
    const first = await (await uploaded).json();
    await expect(dialog).toBeHidden();
    await expect(page.locator("main img:visible")).toHaveAttribute(
      "src",
      `${API}${first.avatarUrl}`,
    );
    await expect(page.locator("header img:visible")).toHaveAttribute(
      "src",
      `${API}${first.avatarUrl}`,
    );
    await expect(sibling.locator("header img:visible")).toHaveAttribute(
      "src",
      `${API}${first.avatarUrl}`,
    );
    await expect
      .poll(() =>
        page
          .locator("main img:visible")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Đổi ảnh đại diện", exact: true })
      .click();
    await picker.setInputFiles({
      ...firstFile,
      buffer: await makeAvatarImage("#ff6600"),
    });
    const replaced = page.waitForResponse(
      (res) =>
        res.url() === `${API}/users/me/avatar` &&
        res.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Tải ảnh lên" }).click();
    const next = await (await replaced).json();
    expect(next.avatarUrl).not.toBe(first.avatarUrl);
    expect(
      (await db.query("SELECT avatar_key FROM users WHERE email=$1", [email]))
        .rows[0].avatar_key,
    ).toBe(next.avatarUrl.split("/").pop());
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.locator("main img:visible")).toHaveAttribute(
      "src",
      `${API}${next.avatarUrl}`,
    );
    // Editing the display name must preserve the avatar in the shared user response.
    await page
      .getByRole("button", { name: "Chỉnh sửa hồ sơ", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Tên hiển thị", { exact: true })
      .fill("Avatar Owner");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(
      page.getByRole("heading", { name: "Avatar Owner", exact: true }),
    ).toBeVisible();
    await expect(page.locator("header img:visible")).toHaveAttribute(
      "src",
      `${API}${next.avatarUrl}`,
    );
    await page
      .getByRole("button", { name: "Đổi ảnh đại diện", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Xóa ảnh đại diện", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText("Xóa ảnh đại diện?");
    await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
    expect(
      (await (await context.request.get(`${API}/users/me`)).json()).avatarUrl,
    ).toBe(next.avatarUrl);
    await dialog
      .getByRole("button", { name: "Xóa ảnh đại diện", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Xác nhận xóa ảnh" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("header img:visible")).toHaveCount(0);
    await expect(page.locator("main img:visible")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Tài khoản" }),
    ).toContainText("AO");
    await expect(sibling.locator("header img:visible")).toHaveCount(0);
    expect(
      (await db.query("SELECT avatar_key FROM users WHERE email=$1", [email]))
        .rows[0].avatar_key,
    ).toBeNull();
  });
}

for (const failure of [400, 413, 415, 500, "network"] as const) {
  test(`avatar upload retains preview on ${failure} and retries`, async ({
    page,
  }) => {
    await register(page);
    await page
      .getByRole("button", { name: "Tải ảnh đại diện", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Chọn ảnh").setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: await makeAvatarImage("blue"),
    });
    await page.route(`${API}/users/me/avatar`, (route) =>
      failure === "network"
        ? route.abort()
        : route.fulfill({
            status: failure,
            json: { message: "private storage path" },
          }),
    );
    await dialog.getByRole("button", { name: "Tải ảnh lên" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog).not.toContainText("private storage path");
    await expect(dialog.getByAltText("Xem trước ảnh đại diện")).toBeVisible();
    await page.unroute(`${API}/users/me/avatar`);
    await dialog.getByRole("button", { name: "Tải ảnh lên" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("header img:visible")).toBeVisible();
  });
}

test("avatar rejects invalid selections and prevents repeated upload/remove", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", { name: "Tải ảnh đại diện", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const picker = dialog.getByLabel("Chọn ảnh");
  await picker.setInputFiles({
    name: "a.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(picker).toHaveValue("");
  await expect(dialog.getByRole("alert")).toContainText("JPEG, PNG hoặc WebP");
  await picker.setInputFiles({
    name: "a.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
  });
  await expect(dialog.getByRole("alert")).toContainText("2 MB");
  await picker.setInputFiles({
    name: "a.png",
    mimeType: "image/png",
    buffer: await makeAvatarImage("green"),
  });
  let calls = 0;
  await page.route(`${API}/users/me/avatar`, async (route) => {
    calls++;
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ response });
  });
  await dialog.getByRole("button", { name: "Tải ảnh lên" }).click();
  await expect(
    dialog.getByRole("button", { name: "Đang xử lý…" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(calls).toBe(1);
  await page
    .getByRole("button", { name: "Đổi ảnh đại diện", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Xóa ảnh đại diện", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Xác nhận xóa ảnh" }).click();
  await expect(
    dialog.getByRole("button", { name: "Đang xử lý…" }),
  ).toBeDisabled();
  await expect(dialog).toBeHidden();
  expect(calls).toBe(2);
});

test("avatar removal failure keeps current image and expired upload returns to login", async ({
  page,
  context,
}) => {
  const email = await register(page);
  const uploaded = await context.request.post(`${API}/users/me/avatar`, {
    headers: { Origin: WEB },
    multipart: {
      file: {
        name: "a.png",
        mimeType: "image/png",
        buffer: await makeAvatarImage("blue"),
      },
    },
  });
  expect(uploaded.status()).toBe(200);
  const avatarUrl = (await uploaded.json()).avatarUrl;
  await page.reload();
  await page
    .getByRole("button", { name: "Đổi ảnh đại diện", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Xóa ảnh đại diện", exact: true })
    .click();
  await page.route(`${API}/users/me/avatar`, (route) =>
    route.fulfill({ status: 500, json: {} }),
  );
  await dialog.getByRole("button", { name: "Xác nhận xóa ảnh" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(page.locator("header img")).toHaveAttribute(
    "src",
    `${API}${avatarUrl}`,
  );
  await page.unroute(`${API}/users/me/avatar`);
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await dialog.getByLabel("Chọn ảnh").setInputFiles({
    name: "a.png",
    mimeType: "image/png",
    buffer: await makeAvatarImage("red"),
  });
  await db.query(
    "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM users WHERE email=$1)",
    [email],
  );
  await dialog.getByRole("button", { name: "Tải ảnh lên" }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fprofile$/);
  expect(
    (await db.query("SELECT avatar_key FROM users WHERE email=$1", [email]))
      .rows[0].avatar_key,
  ).toBe(avatarUrl.split("/").pop());
});

test("unavailable avatar falls back and canceled preview revokes its object URL", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL;
    Object.assign(window, { avatarRevocations: 0 });
    URL.revokeObjectURL = (url) => {
      Object.assign(window, {
        avatarRevocations:
          (window as unknown as { avatarRevocations: number })
            .avatarRevocations + 1,
      });
      original(url);
    };
  });
  await register(page);
  const uploaded = await context.request.post(`${API}/users/me/avatar`, {
    headers: { Origin: WEB },
    multipart: {
      file: {
        name: "a.png",
        mimeType: "image/png",
        buffer: await makeAvatarImage("blue"),
      },
    },
  });
  expect(uploaded.status()).toBe(200);
  await page.route(`${API}/avatars/*`, (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Đổi ảnh đại diện", exact: true }),
  ).toBeVisible();
  await expect(page.locator("header img")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Tài khoản" }),
  ).toContainText("BS");
  await page
    .getByRole("button", { name: "Đổi ảnh đại diện", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Chọn ảnh").setInputFiles({
    name: "a.png",
    mimeType: "image/png",
    buffer: await makeAvatarImage("blue"),
  });
  await expect(dialog.getByAltText("Xem trước ảnh đại diện")).toBeVisible();
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { avatarRevocations: number })
            .avatarRevocations,
      ),
    )
    .toBe(1);
});

test("concurrent avatar responses across tabs converge on the committed current user", async ({
  page,
  context,
}) => {
  await register(page);
  const sibling = await context.newPage();
  await sibling.goto("/profile");
  await expect(
    sibling.getByRole("button", { name: "Tải ảnh đại diện", exact: true }),
  ).toBeVisible();
  let release!: () => void;
  let committed!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    committed = resolve;
  });
  await page.route(`${API}/users/me/avatar`, async (route) => {
    const response = await route.fetch();
    committed();
    await gate;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Tải ảnh đại diện", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Chọn ảnh")
    .setInputFiles({
      name: "a.png",
      mimeType: "image/png",
      buffer: await makeAvatarImage("blue"),
    });
  await page.getByRole("button", { name: "Tải ảnh lên" }).click();
  await ready;
  await sibling
    .getByRole("button", { name: /^(Tải|Đổi) ảnh đại diện$/ })
    .click();
  await sibling
    .getByRole("dialog")
    .getByLabel("Chọn ảnh")
    .setInputFiles({
      name: "b.png",
      mimeType: "image/png",
      buffer: await makeAvatarImage("red"),
    });
  const saved = sibling.waitForResponse(
    (res) => res.url() === `${API}/users/me/avatar`,
  );
  await sibling.getByRole("button", { name: "Tải ảnh lên" }).click();
  const latest = await (await saved).json();
  await expect(page.locator("header img:visible")).toHaveAttribute(
    "src",
    `${API}${latest.avatarUrl}`,
  );
  release();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("header img:visible")).toHaveAttribute(
    "src",
    `${API}${latest.avatarUrl}`,
  );
  await expect(sibling.locator("header img:visible")).toHaveAttribute(
    "src",
    `${API}${latest.avatarUrl}`,
  );
});
