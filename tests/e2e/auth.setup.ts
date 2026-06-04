import { test as setup } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import path from "path";
import fs from "fs";

const authDir = path.join(process.cwd(), "playwright/.auth");

setup.beforeAll(() => {
  fs.mkdirSync(authDir, { recursive: true });
});

setup("authenticate as admin-user", async ({ page }) => {
  await loginAs(page, "admin-user", "Admin1234!");
  await page.context().storageState({
    path: path.join(authDir, "admin.json"),
  });
});

setup("authenticate as doctor-user", async ({ page }) => {
  await loginAs(page, "doctor-user", "Doctor1234!");
  await page.context().storageState({
    path: path.join(authDir, "doctor.json"),
  });
});
