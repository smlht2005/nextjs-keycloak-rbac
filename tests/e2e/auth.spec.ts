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

test("switch account clears SSO and redirects to Keycloak login", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /切換帳號登入/i }).click();
  // /api/auth/switch deletes session server-side, then redirects to /api/auth/login
  // which redirects to Keycloak auth endpoint — no confirmation page
  await page.waitForURL(/localhost:8080.*openid-connect\/auth/, { timeout: 10000 });
  await expect(page.url()).toContain("openid-connect/auth");
});
