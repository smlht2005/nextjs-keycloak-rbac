import { type Page, expect } from "@playwright/test";

export async function loginAs(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);

  await page.getByRole("link", { name: /Sign in with Keycloak/i }).click();

  await page.waitForURL(/localhost:8080\/realms\/hospital/, { timeout: 10000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("#kc-login");

  // Admin redirects to /admin/users; others land on /dashboard
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15000 });
}

export async function logout(page: Page): Promise<void> {
  await page.goto("/api/auth/logout");
  await page.waitForURL(/\/login/, { timeout: 5000 });
}
