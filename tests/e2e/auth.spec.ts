import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";

test("unauthenticated user is redirected to Keycloak login", async ({
  page,
}) => {
  await page.goto("/dashboard");
  // Middleware → /api/auth/login → Keycloak (no /login intermediate stop)
  await page.waitForURL(/localhost:8080\/realms\/hospital/, { timeout: 10000 });
  await expect(page.url()).toContain("localhost:8080");
});

test("login with valid credentials lands on a protected page", async ({
  page,
}) => {
  await loginAs(page, "admin-user", "Admin1234!");
  // Admin is redirected to /admin/users; others to /dashboard
  await expect(page).toHaveURL(/\/(dashboard|admin)/);
  // Username chip is always in the header
  await expect(
    page.locator("span.font-medium.text-gray-700").first()
  ).toContainText("admin-user");
});

test("sign out clears session and redirects to /login", async ({ page }) => {
  await loginAs(page, "doctor-user", "Doctor1234!");
  await logout(page);
  // Logout should destroy session and redirect to /login
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("link", { name: /Sign in with Keycloak/i })).toBeVisible();
});

test("switch account goes directly to Keycloak login form (no logout confirmation)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /切換帳號登入/i }).click();
  // Must land on Keycloak auth endpoint (not logout endpoint) with prompt=login
  await page.waitForURL(/localhost:8080.*openid-connect\/auth.*prompt=login/, {
    timeout: 10000,
  });
  expect(page.url()).toContain("openid-connect/auth");
  expect(page.url()).toContain("prompt=login");
  // Keycloak login form (not logout confirmation) should be visible
  await expect(page.locator("#username")).toBeVisible({ timeout: 5000 });
});
