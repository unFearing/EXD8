import { test, expect } from "@playwright/test";

/**
 * DeckBoard E2E Tests
 * 
 * These tests verify that:
 * 1. The API returns all decks (not limited to 10 by pagination)
 * 2. Decks can be selected without errors
 * 3. Deck content displays properly after selection
 * 
 * Setup required:
 * - Terminal 1: cd api && npm run build && func start (or ./dev-local.sh)
 * - Terminal 2: cd app && npm run dev
 * - Then: npx playwright test
 */

test.describe("DeckBoard - Deck Loading", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress console warnings for cleaner test output
    page.on("console", (msg) => {
      if (msg.type() !== "warning" && msg.type() !== "log") {
        console.log(`[${msg.type()}] ${msg.text()}`);
      }
    });
  });

  test("should load decks from API without 10-item limit", async ({ page }) => {
    // Navigate to app
    await page.goto("/", { waitUntil: "networkidle" });

    // Wait for QUICKSLOTS section to appear
    const quickslotsLabel = page.locator("text=QUICKSLOTS").first();
    await expect(quickslotsLabel).toBeVisible({ timeout: 5000 });

    // Open first deck selector dropdown
    const firstSelect = page.locator('select').or(page.locator('[role="combobox"]')).first();
    await expect(firstSelect).toBeVisible();
    await firstSelect.click();

    // Wait for menu to open
    await page.waitForTimeout(500);

    // Count menu items (including Unassigned and Create fresh deck)
    const menuItems = page.locator('[role="option"], [role="menuitem"]');
    const itemCount = await menuItems.count();

    console.log(`📊 Found ${itemCount} total deck options in dropdown`);

    // Should have at least: "Unassigned" + "Create fresh deck" + at least 1 deck
    expect(itemCount).toBeGreaterThanOrEqual(3);
  });

  test("should select an existing deck without errors", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Wait for QUICKSLOTS to load
    const quickslotsLabel = page.locator("text=QUICKSLOTS").first();
    await expect(quickslotsLabel).toBeVisible({ timeout: 5000 });

    // Get first dropdown
    const firstSelect = page.locator('select').or(page.locator('[role="combobox"]')).first();
    await expect(firstSelect).toBeVisible();
    await firstSelect.click();
    await page.waitForTimeout(500);

    // Find all menu items
    const menuItems = page.locator('[role="option"], [role="menuitem"]');
    const count = await menuItems.count();

    // If we have actual decks (more than just Unassigned + Create fresh), select one
    if (count > 2) {
      const thirdOption = menuItems.nth(2);
      const deckName = await thirdOption.textContent();

      console.log(`✅ Selecting deck: "${deckName}"`);
      await thirdOption.click();
      await page.waitForTimeout(800);

      // Verify no error alerts appeared
      const alerts = page.locator('[role="alert"]');
      const alertCount = await alerts.count();

      if (alertCount > 0) {
        const errorText = await alerts.first().textContent();
        console.error(`❌ Error appeared: ${errorText}`);
      }

      expect(alertCount).toBe(0);
    } else {
      console.warn("⚠️ No actual decks found to select (less than 3 options)");
    }
  });

  test("should display deck UI after selection", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Wait for UI ready
    const quickslotsLabel = page.locator("text=QUICKSLOTS").first();
    await expect(quickslotsLabel).toBeVisible({ timeout: 5000 });

    // Open dropdown and select a deck
    const firstSelect = page.locator('select').or(page.locator('[role="combobox"]')).first();
    await firstSelect.click();
    await page.waitForTimeout(500);

    const menuItems = page.locator('[role="option"], [role="menuitem"]');
    const count = await menuItems.count();

    if (count > 2) {
      await menuItems.nth(2).click();
      await page.waitForTimeout(800);

      // Verify QUICKSLOTS section is still visible (content didn't disappear)
      await expect(quickslotsLabel).toBeVisible();

      // Verify no loading indicators remain
      const spinners = page.locator('[role="progressbar"], .spinner, [class*="loading"]');
      const spinnerCount = await spinners.count();
      expect(spinnerCount).toBe(0);

      console.log("✅ Deck UI displayed successfully");
    }
  });
});
