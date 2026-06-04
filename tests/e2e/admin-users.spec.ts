import { test, expect } from "@playwright/test";
import path from "path";

test.describe("admin users page", () => {
  test.use({
    storageState: path.join(process.cwd(), "playwright/.auth/admin.json"),
  });

  test("loads user list", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(4, { timeout: 10000 });
  });

  test("can search for a specific user", async ({ page }) => {
    await page.goto("/admin/users");
    await page.locator("table").waitFor({ timeout: 10000 });

    await page.fill('input[placeholder*="搜尋"]', "doctor");
    await page.getByRole("button", { name: /搜尋/i }).click();
    await page.waitForTimeout(500);

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1, { timeout: 5000 });
    // Use row-specific locator to avoid matching the header chip
    await expect(page.locator("tbody tr", { hasText: "doctor-user" })).toBeVisible();
  });

  test("can edit a user first name", async ({ page }) => {
    await page.goto("/admin/users");
    await page.locator("table").waitFor({ timeout: 10000 });

    // Click the pencil/edit button (first button) in the doctor-user row
    const doctorRow = page.locator("tr", { hasText: "doctor-user" });
    await doctorRow.locator("button").nth(0).click();

    // Modal uses div.fixed.inset-0, not role="dialog"
    const modal = page.locator(".fixed.inset-0");
    await expect(page.getByText("編輯使用者")).toBeVisible({ timeout: 5000 });

    // 名(First) is the 3rd input (Email, 姓Last, 名First, 密碼)
    const firstNameInput = modal.locator("input").nth(2);
    await firstNameInput.clear();
    await firstNameInput.fill("DrTest");

    await page.getByRole("button", { name: "儲存" }).click();

    // Modal closes after save
    await expect(page.getByText("編輯使用者")).toBeHidden({ timeout: 5000 });
  });

  test("non-admin (doctor) cannot access admin users page", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: path.join(process.cwd(), "playwright/.auth/doctor.json"),
    });
    const page = await ctx.newPage();
    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/\/admin\/users/);
    await ctx.close();
  });
});
