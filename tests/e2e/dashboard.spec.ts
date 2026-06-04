import { test, expect } from "@playwright/test";
import path from "path";

test.describe("dashboard — admin role", () => {
  test.use({
    storageState: path.join(process.cwd(), "playwright/.auth/admin.json"),
  });

  // Admin is redirected from /dashboard to /admin/users
  test("admin lands on /admin/users and header chip shows username", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/admin\/users/);
    // Header chip span — distinct from user list rows
    await expect(
      page.locator("span.font-medium.text-gray-700").first()
    ).toContainText("admin-user");
  });

  test("admin/users page shows sign-out button in header", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("link", { name: /登出/i })).toBeVisible();
  });
});

test.describe("dashboard — doctor role", () => {
  test.use({
    storageState: path.join(process.cwd(), "playwright/.auth/doctor.json"),
  });

  test("loads /dashboard and shows doctor username chip", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.locator("span.font-medium.text-gray-700").first()
    ).toContainText("doctor-user");
  });

  test("shows doctor role badge", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByText("doctor", { exact: true })
    ).toBeVisible();
  });
});
