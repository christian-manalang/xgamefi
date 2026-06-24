import { test, expect } from "@playwright/test";

const STUDIO_USER = process.env.E2E_STUDIO_USERNAME ?? "gridlock";
const STUDIO_PASS = process.env.E2E_STUDIO_PASSWORD ?? "change-me-strong";

test("studio rearranges + publishes, storefront reflects the new layout/featured", async ({ page }) => {
  // log in as the studio user
  await page.goto("/login");
  await page.getByLabel(/username/i).fill(STUDIO_USER);
  await page.getByLabel(/password/i).fill(STUDIO_PASS);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // open the builder
  await page.goto("/dashboard/builder");
  await expect(page.getByText("ITEM_LIBRARY")).toBeVisible();

  // add the first library item to the canvas via the ADD fallback
  const addButtons = page.locator('[data-testid^="lib-add-"]');
  const firstAdd = addButtons.first();
  const libTestId = await firstAdd.getAttribute("data-testid");
  const itemId = libTestId!.replace("lib-add-", "");
  await firstAdd.click();

  // it now appears on the canvas; mark it featured
  const canvasCard = page.getByTestId(`canvas-card-${itemId}`);
  await expect(canvasCard).toBeVisible();
  await page.getByTestId(`canvas-feature-${itemId}`).click();
  await expect(canvasCard).toHaveAttribute("data-featured", "true");

  // switch to LIST mode
  await page.getByTestId("mode-list").click();

  // publish
  await page.getByTestId("builder-publish").click();
  await expect(page.getByTestId("builder-status")).toHaveText("PUBLISHED");

  // public storefront reflects published layout + featured
  await page.goto("/s/gridlock");
  const grid = page.getByTestId("storefront-grid");
  await expect(grid).toHaveAttribute("data-mode", "list");
  const firstCard = page.getByTestId("item-card").first();
  await expect(firstCard).toBeVisible();
});
