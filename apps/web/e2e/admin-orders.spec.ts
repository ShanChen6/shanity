import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";

/**
 * Real-stack admin order console (PAY17). Prerequisites, on top of the payment
 * journey's (seeded PAID sample course, BANK_WEBHOOK_API_KEY on the API):
 *  - an admin and a finance officer account:
 *      E2E_ADMIN_EMAIL / E2E_FINANCE_EMAIL  and  E2E_STAFF_PASSWORD
 *    (register through the API, then INSERT INTO user_roles(user_id, role_code)).
 */
const COURSE_SLUG = "javascript-co-ban-cho-nguoi-moi";
const COURSE_PATH = `/courses/${COURSE_SLUG}`;
const API_URL = (process.env.API_TEST_URL ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const FINANCE_EMAIL = process.env.E2E_FINANCE_EMAIL;
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD;
// 1x1 PNG, enough for the API's magic-byte check.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.skip(
  !ADMIN_EMAIL || !FINANCE_EMAIL || !STAFF_PASSWORD,
  "E2E_ADMIN_EMAIL, E2E_FINANCE_EMAIL and E2E_STAFF_PASSWORD are required",
);

async function newStaffPage(browser: Browser, testInfo: TestInfo) {
  const { baseURL, viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    isMobile,
    hasTouch,
  });
  return { context, page: await context.newPage() };
}

async function staffLogin(page: Page, email: string) {
  await page.goto("/admin/login");
  const emailField = page.locator("#admin-login-email");
  const passwordField = page.locator("#admin-login-password");
  // The dev server can hydrate after the first keystrokes and reset the form.
  await expect(async () => {
    await emailField.fill(email);
    await passwordField.fill(STAFF_PASSWORD!);
    await expect(emailField).toHaveValue(email);
    await expect(passwordField).toHaveValue(STAFF_PASSWORD!);
  }).toPass();
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith("/admin/login"));
}

/** A student who has an unpaid order for the sample course. */
async function studentWithOrder(page: Page, testInfo: TestInfo) {
  const suffix = `${testInfo.project.name}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const email = `adm-${suffix}@example.test`;
  await page.goto(`/register?redirect=${encodeURIComponent(COURSE_PATH)}`);
  await page.locator("#auth-displayName").fill("Học viên Đối soát");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("Shanity-E2E-2026!");
  await page.locator("#auth-confirmPassword").fill("Shanity-E2E-2026!");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${COURSE_PATH}$`));
  await page.getByRole("button", { name: "Mua khóa học" }).click();
  await expect(page).toHaveURL(/\/checkout\/SHAN-\d{8}-[A-Z0-9]{4}$/);
  return {
    email,
    code: decodeURIComponent(page.url().split("/checkout/")[1]!),
  };
}

async function openOrder(page: Page, code: string) {
  await page.goto("/admin/orders");
  await page.getByLabel("Tìm kiếm", { exact: true }).fill(code);
  await page
    .getByRole("button", { name: `Xem chi tiết đơn ${code}` })
    .filter({ visible: true })
    .first()
    .click();
  const drawer = page.getByRole("dialog", { name: `Đơn hàng ${code}` });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Học viên Đối soát")).toBeVisible();
  return drawer;
}

async function isPaid(student: Page, code: string) {
  const response = await student.request.get(
    `${API_URL}/orders/${code}/status`,
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { isPaid: boolean }).isPaid;
}

test.describe("Admin order console", () => {
  test("reconcile a lost payment, then refund partially and fully", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    const { code, email } = await studentWithOrder(page, testInfo);
    const { page: admin, context } = await newStaffPage(browser, testInfo);
    try {
      await staffLogin(admin, ADMIN_EMAIL!);

      await test.step("the order is findable and its detail has no status control", async () => {
        const drawer = await openOrder(admin, code);
        await expect(drawer.getByText(email).first()).toBeVisible();
        await expect(
          drawer.getByText("JavaScript Cơ bản cho người mới").first(),
        ).toBeVisible();
        await expect(
          drawer.getByText("Đơn hàng được tạo", { exact: true }),
        ).toBeVisible();
        await expect(
          drawer.getByRole("heading", { name: "Nhật ký kiểm toán" }),
        ).toBeVisible();
        await expect(
          drawer.getByText("Xem chi tiết đơn hàng", { exact: true }).first(),
        ).toBeVisible();
        // There is no way to just flip the status.
        await expect(
          admin.getByRole("button", {
            name: /đánh dấu|đổi trạng thái|đã thanh toán/i,
          }),
        ).toHaveCount(0);
        await expect(
          admin.getByRole("combobox", { name: /trạng thái đơn/i }),
        ).toHaveCount(0);
        await expect(
          drawer.getByRole("button", { name: "Hoàn tiền" }),
        ).toHaveCount(0);
      });
      expect(await isPaid(page, code)).toBe(false);

      await test.step("reconcile needs txn id, reason, proof and confirmation", async () => {
        const drawer = admin.getByRole("dialog", { name: `Đơn hàng ${code}` });
        await drawer.getByRole("button", { name: "Đối soát thủ công" }).click();
        const modal = admin.getByRole("dialog", {
          name: `Đối soát thủ công đơn ${code}`,
        });
        const submit = modal.getByRole("button", {
          name: "Xác nhận đối soát",
        });
        await expect(submit).toBeDisabled();
        await modal
          .getByLabel("Mã giao dịch ngân hàng")
          .fill("FT-E2E-" + Date.now());
        await modal
          .getByLabel("Lý do / ghi chú đối soát")
          .fill("Học viên chuyển khoản nhưng webhook ngân hàng bị mất");
        await expect(submit).toBeDisabled();
        await modal.getByLabel(/Chứng từ chuyển khoản/).setInputFiles({
          name: "sao-ke.png",
          mimeType: "image/png",
          buffer: PNG,
        });
        await expect(modal.getByText(/Đã tải lên/)).toBeVisible();
        await modal
          .getByLabel("Tôi xác nhận đã kiểm tra sao kê ngân hàng")
          .check();
        await expect(submit).toBeEnabled();
        await submit.click();
        await expect(modal.getByText("Đối soát thành công")).toBeVisible();
        await modal.getByRole("button", { name: "Đóng" }).click();
      });

      await test.step("the order is completed, access granted and the trail shows it", async () => {
        expect(await isPaid(page, code)).toBe(true);
        const drawer = admin.getByRole("dialog", { name: `Đơn hàng ${code}` });
        await expect(
          drawer.getByText("Hoàn tất", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          drawer.getByText("Đối soát thủ công", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          drawer.getByText("Cấp quyền học", { exact: true }),
        ).toBeVisible();
        await expect(
          drawer.getByText("Tải lên chứng từ", { exact: true }),
        ).toBeVisible();
        await expect(
          drawer.getByRole("button", { name: "Đối soát thủ công" }),
        ).toHaveCount(0);
        await expect(
          drawer.getByText(ADMIN_EMAIL!).filter({ visible: true }).first(),
        ).toBeVisible();
      });

      await test.step("partial refund keeps access", async () => {
        const drawer = admin.getByRole("dialog", { name: `Đơn hàng ${code}` });
        await drawer.getByRole("button", { name: "Hoàn tiền" }).click();
        const modal = admin.getByRole("dialog", {
          name: `Hoàn tiền đơn ${code}`,
        });
        await modal.getByLabel(/Số tiền hoàn/).fill("100000");
        await modal
          .getByRole("textbox", { name: "Lý do hoàn tiền" })
          .fill("Học viên yêu cầu hoàn một phần theo chính sách");
        await modal.getByLabel(/Tôi xác nhận số tiền/).check();
        await modal.getByRole("button", { name: "Xác nhận hoàn tiền" }).click();
        await expect(modal.getByText("Đã ghi nhận hoàn tiền")).toBeVisible();
        await modal.getByRole("button", { name: "Đóng" }).click();
        await expect(
          drawer.getByText("Hoàn một phần", { exact: true }).first(),
        ).toBeVisible();
        expect(await isPaid(page, code)).toBe(true);
      });

      await test.step("full refund revokes access", async () => {
        const drawer = admin.getByRole("dialog", { name: `Đơn hàng ${code}` });
        await drawer.getByRole("button", { name: "Hoàn tiền" }).click();
        const modal = admin.getByRole("dialog", {
          name: `Hoàn tiền đơn ${code}`,
        });
        await modal.getByRole("button", { name: "Hoàn toàn bộ" }).click();
        await modal
          .getByRole("textbox", { name: "Lý do hoàn tiền" })
          .fill("Hoàn nốt phần còn lại, học viên rút khỏi khóa học");
        await modal.getByLabel(/Tôi xác nhận số tiền/).check();
        await modal.getByRole("button", { name: "Xác nhận hoàn tiền" }).click();
        await expect(modal.getByText("Đã ghi nhận hoàn tiền")).toBeVisible();
        await modal.getByRole("button", { name: "Đóng" }).click();
        await expect(
          drawer.getByText("Đã hoàn tiền", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          drawer.getByText("Thu hồi quyền học", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          drawer.getByText("Đã thu hồi", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          drawer.getByRole("button", { name: "Hoàn tiền" }),
        ).toHaveCount(0);
        expect(await isPaid(page, code)).toBe(false);
      });
    } finally {
      await context.close();
    }
  });

  test("a finance officer gets the order console only", async ({
    browser,
  }, testInfo) => {
    const { page, context } = await newStaffPage(browser, testInfo);
    try {
      await staffLogin(page, FINANCE_EMAIL!);
      await expect(page).toHaveURL(/\/admin\/orders$/);
      await expect(
        page.getByRole("heading", { name: /Đơn hàng/ }).first(),
      ).toBeVisible();
      await expect(page.getByLabel("Tìm kiếm", { exact: true })).toBeVisible();
      // Admin-only areas bounce them back.
      await page.goto("/admin/users");
      await expect(page).not.toHaveURL(/\/admin\/users/);
    } finally {
      await context.close();
    }
  });

  test("a student cannot open the console", async ({ page }, testInfo) => {
    await studentWithOrder(page, testInfo);
    await page.goto("/admin/orders");
    await expect(page).not.toHaveURL(/\/admin\/orders$/);
    const api = await page.request.get(`${API_URL}/api/v1/admin/orders`);
    expect(api.status()).toBe(403);
  });
});
