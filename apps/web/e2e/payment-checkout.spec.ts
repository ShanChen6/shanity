import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Real-stack payment journey (PAY14-16). Prerequisites:
 *  - the sample course is seeded (`node database/cli.mjs seed-course`) and made
 *    PAID:  UPDATE courses SET access_type='PAID', price=499000
 *          WHERE slug='javascript-co-ban-cho-nguoi-moi';
 *  - the API runs with BANK_WEBHOOK_API_KEY, VIETQR_* set and WEB_ORIGIN equal
 *    to the web URL; E2E_BANK_WEBHOOK_KEY holds the same key for this test.
 */
const COURSE_SLUG = "javascript-co-ban-cho-nguoi-moi";
const COURSE_PATH = `/courses/${COURSE_SLUG}`;
const API_URL = (process.env.API_TEST_URL ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);
const BANK_KEY = process.env.E2E_BANK_WEBHOOK_KEY;
const PRICE = 499000;

test.skip(!BANK_KEY, "E2E_BANK_WEBHOOK_KEY is required for payment E2E");

async function registerStudent(page: Page, testInfo: TestInfo, label: string) {
  const suffix = `${label}-${testInfo.project.name}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  await page.goto(`/register?redirect=${encodeURIComponent(COURSE_PATH)}`);
  await page.locator("#auth-displayName").fill("Học viên Thanh toán");
  await page.locator("#auth-email").fill(`pay-${suffix}@example.test`);
  await page.locator("#auth-password").fill("Shanity-E2E-2026!");
  await page.locator("#auth-confirmPassword").fill("Shanity-E2E-2026!");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${COURSE_PATH}$`));
}

async function buyCourse(page: Page) {
  await expect(page.getByLabel(/Giá 499/)).toBeVisible();
  await page.getByRole("button", { name: "Mua khóa học" }).click();
  await expect(page).toHaveURL(/\/checkout\/SHAN-\d{8}-[A-Z0-9]{4}$/);
  return decodeURIComponent(page.url().split("/checkout/")[1]!);
}

/** What the bank forwarder sends when the student's transfer arrives. */
async function bankTransfer(page: Page, orderCode: string, amount = PRICE) {
  const response = await page.request.post(
    `${API_URL}/payments/webhook/vietqr`,
    {
      headers: { "x-api-key": BANK_KEY! },
      data: {
        transactionId: `FT-E2E-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        amount,
        transferContent: `CK ${orderCode.replaceAll("-", "")}`,
      },
    },
  );
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ status: string }>;
}

test.describe("Student payment journey", () => {
  test("buy -> QR checkout -> auto-detected payment -> classroom -> history", async ({
    page,
  }, testInfo) => {
    await registerStudent(page, testInfo, "buy");

    await test.step("course page shows the price and a Buy button", async () => {
      await expect(
        page.getByRole("button", { name: "Mua khóa học" }),
      ).toBeVisible();
      await expect(page.getByLabel(/Giá 499/)).toContainText("499.000");
    });

    let code = "";
    await test.step("Buy opens checkout with the frozen order, QR and countdown", async () => {
      code = await buyCourse(page);
      await expect(
        page.getByRole("heading", { name: "Hoàn tất đơn hàng" }),
      ).toBeVisible();
      await expect(
        page.getByText("JavaScript Cơ bản cho người mới").first(),
      ).toBeVisible();
      await expect(page.getByTestId("order-total")).toContainText("499.000");
      await expect(page.getByRole("timer")).toContainText(/\d\d:\d\d/);
      await expect(
        page.getByRole("heading", { name: "Quét mã để chuyển khoản" }),
      ).toBeVisible();
      await expect(page.getByText(/đang chờ ngân hàng xác nhận/)).toBeVisible();
      await expect(
        page.getByText(code.replaceAll("-", ""), { exact: true }),
      ).toBeVisible();
    });

    await test.step("the QR is restored after a reload (idempotent checkout)", async () => {
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Quét mã để chuyển khoản" }),
      ).toBeVisible();
      await expect(page.getByTestId("order-total")).toContainText("499.000");
    });

    await test.step("the page flips to SUCCESS by itself when the bank confirms", async () => {
      await expect(page.getByText("Thanh toán thành công!")).toHaveCount(0);
      expect((await bankTransfer(page, code)).status).toBe("COMPLETED");
      await expect(page.getByText("Thanh toán thành công!")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("confetti")).toBeAttached();
      await expect(page.getByText(/^FT-E2E-/)).toBeVisible();
    });

    await test.step("a second transfer for a paid order is only recorded, nothing changes", async () => {
      expect((await bankTransfer(page, code)).status).toBe("IGNORED");
      await expect(page.getByText("Thanh toán thành công!")).toBeVisible();
    });

    await test.step("Bắt đầu học ngay opens the classroom", async () => {
      await page.getByRole("link", { name: "Bắt đầu học ngay" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${COURSE_SLUG}`));
    });

    await test.step("course page now says Vào học ngay (no buy button)", async () => {
      await page.goto(COURSE_PATH);
      await expect(
        page.getByRole("link", { name: /Vào học ngay|Tiếp tục học/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Mua khóa học" }),
      ).toHaveCount(0);
    });

    await test.step("order history lists the completed order with its transaction", async () => {
      await page.goto("/account/orders");
      await expect(
        page.getByRole("heading", { name: "Đơn hàng của tôi" }),
      ).toBeVisible();
      // the table (desktop) or the cards (mobile): only one of them is visible
      await expect(
        page.getByText(code).filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Hoàn tất").filter({ visible: true }).first(),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Đang chờ" }).click();
      await expect(page).toHaveURL(/status=pending/);
      await expect(
        page.getByText("Không có đơn nào đang chờ thanh toán"),
      ).toBeVisible();
    });
  });

  test("fulfilment does not need the browser: paid while the tab is closed", async ({
    page,
  }, testInfo) => {
    await registerStudent(page, testInfo, "offpage");
    const code = await buyCourse(page);

    // The student closes the checkout and wanders off before paying.
    await page.goto("/courses");
    await page.goto("/account/orders");
    await expect(
      page.getByRole("link", { name: "Thanh toán ngay" }).first(),
    ).toBeVisible();

    // Money arrives later; nobody is looking at the order.
    expect((await bankTransfer(page, code)).status).toBe("COMPLETED");

    await page.goto(COURSE_PATH);
    await expect(
      page.getByRole("link", { name: /Vào học ngay|Tiếp tục học/ }),
    ).toBeVisible();
    await page.goto(`/checkout/${code}`);
    await expect(page.getByText("Thanh toán thành công!")).toBeVisible();
  });

  test("a pending order can be resumed from the history", async ({
    page,
  }, testInfo) => {
    await registerStudent(page, testInfo, "resume");
    const code = await buyCourse(page);
    await page.goto("/account/orders");
    await page
      .getByRole("link", { name: "Thanh toán ngay" })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/checkout/${code}$`));
    await expect(
      page.getByRole("heading", { name: "Quét mã để chuyển khoản" }),
    ).toBeVisible();
    // pressing Buy again reuses the same unpaid order instead of creating another
    await page.goto(COURSE_PATH);
    await page.getByRole("button", { name: "Mua khóa học" }).click();
    await expect(page).toHaveURL(new RegExp(`/checkout/${code}$`));
  });

  test("checkout and history fit the viewport without sideways scrolling", async ({
    page,
  }, testInfo) => {
    await registerStudent(page, testInfo, "layout");
    await buyCourse(page);
    await expect(
      page.getByRole("heading", { name: "Quét mã để chuyển khoản" }),
    ).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.goto("/account/orders");
    await expect(
      page.getByRole("heading", { name: "Đơn hàng của tôi" }),
    ).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test("an unknown order code is a friendly not-found, not a crash", async ({
    page,
  }, testInfo) => {
    await registerStudent(page, testInfo, "missing");
    await page.goto("/checkout/SHAN-20260101-ZZZZ");
    await expect(page.getByText("Không tìm thấy đơn hàng")).toBeVisible();
  });
});
