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
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
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
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await page.goto("/my-courses?filter=in-progress&q=hello%20world");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await login(page, email);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/my-courses" &&
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

test("external and auth-loop return URLs fall back to profile", async ({
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
    await expect(page).toHaveURL(`${WEB}/profile`);
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
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe(path);
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
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login(?:\?redirect=.*)?$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(`${WEB}/login?redirect=%2Fadmin%2Fusers`);
  await login(page, email);
  await expect(page).toHaveURL(`${WEB}/admin/users`);
  await expect(
    page.getByRole("heading", { name: "Người dùng", exact: true }),
  ).toBeVisible();
});
