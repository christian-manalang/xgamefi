import { test, expect } from "@playwright/test";

const STUDIO_USER = process.env.E2E_STUDIO_USERNAME ?? "gridlock";
const STUDIO_PASS = process.env.E2E_STUDIO_PASSWORD ?? "change-me-strong";

test("studio edits an item, toggles listing, and the storefront hides it after publish", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/username/i).fill(STUDIO_USER);
  await page.getByLabel(/password/i).fill(STUDIO_PASS);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  await page.goto("/dashboard/builder");
  await expect(page.getByText("ITEM_LIBRARY")).toBeVisible();

  // select the first library item
  const firstLib = page.locator('[data-testid^="lib-item-"]').first();
  await firstLib.click();
  const libTestId = await firstLib.getAttribute("data-testid");
  const itemId = libTestId!.replace("lib-item-", "");

  // edit the name and make it unlisted
  const newName = `Hidden Item ${Date.now()}`;
  await page.getByTestId("config-name").fill(newName);
  await page.getByTestId("config-listed").setChecked(false);
  await page.getByTestId("config-save").click();

  // canvas should show it as hidden
  const canvasCard = page.getByTestId(`canvas-card-${itemId}`);
  await expect(canvasCard).toContainText("HIDDEN");

  // publish
  await page.getByTestId("builder-publish").click();
  await expect(page.getByTestId("builder-status")).toHaveText("PUBLISHED");

  // public storefront should not show the hidden item
  await page.goto("/s/gridlock");
  await expect(page.getByText(newName)).not.toBeVisible();
});
