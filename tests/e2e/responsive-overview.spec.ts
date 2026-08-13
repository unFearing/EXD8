import { expect, test, type Page } from "@playwright/test";

const firstDeckId = "550e8400-e29b-41d4-a716-446655440000";
const secondDeckId = "550e8400-e29b-41d4-a716-446655440001";

const decks = [
  {
    id: firstDeckId,
    map: "River City",
    side: "1",
    name: "River Team 1",
    deck: [{ slot: 1, primary: ["unF"], alternates: [], lance: "A", mech: "", chassis: "Flea", variant: "FLE-R5K" }],
  },
  {
    id: secondDeckId,
    map: "River City",
    side: "2",
    name: "River Team 2",
    deck: [{ slot: 1, primary: ["Xiph"], alternates: [], lance: "A", mech: "", chassis: "Rifleman", variant: "RFL-LK" }],
  },
];

async function mockApi(page: Page, appRole: "TL" | "Pilot" = "TL") {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const success = (data: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data }),
    });

    if (url.pathname.endsWith("/api/auth/me")) return success({
      id: `${appRole.toLowerCase()}-user`,
      username: appRole === "TL" ? "Team Lead" : "Pilot",
      roles: [`${appRole.toLowerCase()}-role`],
      appRole,
    });
    if (url.pathname.endsWith("/api/auth/config")) return success({ clientId: "12345678901234567" });
    if (url.pathname.endsWith("/api/decks")) return success(decks);
    if (url.pathname.endsWith("/api/quickslots/overview-selection")) {
      const payload = request.postDataJSON() as { overviewSelectedDeckIds: string[] };
      return success({
        id: "quickslots-default",
        slots: [
          { map: "River City", slot: "A", deckId: firstDeckId },
          { map: "River City", slot: "B", deckId: secondDeckId },
        ],
        overviewSelectedDeckIds: payload.overviewSelectedDeckIds,
      });
    }
    if (url.pathname.endsWith("/api/quickslots")) return success({
      id: "quickslots-default",
      slots: [
        { map: "River City", slot: "A", deckId: firstDeckId },
        { map: "River City", slot: "B", deckId: secondDeckId },
      ],
      overviewSelectedDeckIds: [firstDeckId],
    });
    if (url.pathname.endsWith("/api/mechs/hierarchy")) return success([]);
    if (url.pathname.endsWith("/api/mechs")) return success([]);
    if (url.pathname.endsWith("/api/config/maps")) return success([]);
    if (url.pathname.endsWith("/api/config/mech-roles")) return success([]);
    return success([]);
  });
}

test.describe("responsive authenticated views", () => {
  for (const width of [320, 390, 768, 1280]) {
    for (const path of ["/", "/repository", "/overview"]) {
      test(`${path} fits a ${width}px viewport`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await mockApi(page);
        await page.goto(path, { waitUntil: "networkidle" });

        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.viewport).toBe(width);
        expect(dimensions.documentWidth).toBeLessThanOrEqual(width);
      });
    }
  }
});

test.describe("Overview selection modes", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });
  });

  test("TL selection is loaded and persisted through the shared endpoint", async ({ page }) => {
    const first = page.getByTestId(`quickslot-deck-${firstDeckId}`).getByRole("checkbox");
    const second = page.getByTestId(`quickslot-deck-${secondDeckId}`).getByRole("checkbox");
    await expect(first).toBeChecked();
    await expect(second).not.toBeChecked();

    const update = page.waitForRequest((request) => request.url().endsWith("/api/quickslots/overview-selection"));
    await second.check();
    const request = await update;
    expect(request.postDataJSON()).toMatchObject({
      overviewSelectedDeckIds: [firstDeckId, secondDeckId],
    });
  });

  test("local override changes selection without calling the shared endpoint", async ({ page }) => {
    await page.getByRole("switch", { name: "Use my filters" }).check();
    const sharedRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/quickslots/overview-selection")) sharedRequests.push(request.url());
    });

    await page.getByTestId(`quickslot-deck-${secondDeckId}`).getByRole("checkbox").check();
    await expect(page.getByText("Personal filters on this browser")).toBeVisible();
    expect(sharedRequests).toEqual([]);

    await page.getByRole("switch", { name: "Use my filters" }).uncheck();
    await expect(page.getByTestId(`quickslot-deck-${secondDeckId}`).getByRole("checkbox")).not.toBeChecked();
  });
});

test.describe("Pilot Overview selection", () => {
  test.skip(process.env.PLAYWRIGHT_AUTH_ENABLED !== "true", "Requires an auth-enabled Vite instance");

  test("shared selection is read-only but local override remains editable", async ({ page }) => {
    await mockApi(page, "Pilot");
    await page.goto("/overview", { waitUntil: "networkidle" });

    const second = page.getByTestId(`quickslot-deck-${secondDeckId}`).getByRole("checkbox");
    await expect(second).toBeDisabled();

    const sharedRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/quickslots/overview-selection")) sharedRequests.push(request.url());
    });
    await page.getByRole("switch", { name: "Use my filters" }).check();
    await expect(second).toBeEnabled();
    await second.check();
    expect(sharedRequests).toEqual([]);
  });
});
