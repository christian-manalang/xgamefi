import { test, expect } from "@playwright/test";

const slug = `e2e-studio-${Date.now()}`;

test("a new user can self-onboard, log in, and reach the dashboard builder", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel(/username/i).fill(`user-${slug}`);
  await page.getByLabel(/^password/i).fill("correct-horse-battery");
  await page.getByLabel(/confirm password/i).fill("correct-horse-battery");
  await page.getByLabel(/studio name/i).fill("E2E Studio");
  await page.getByLabel(/shop slug/i).fill(slug);
  await page.getByRole("button", { name: /create studio/i }).click();

  await page.waitForURL("/dashboard");
  await expect(page.getByText("E2E Studio")).toBeVisible();

  await page.goto("/dashboard/builder");
  await expect(page.getByText("ITEM_LIBRARY")).toBeVisible();
  await expect(page.getByText(`SHOP_BUILDER · /s/${slug}`)).toBeVisible();
});
