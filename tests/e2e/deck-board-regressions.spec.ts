import { expect, test, type Page } from "@playwright/test";

const staleMechId = "550e8400-e29b-41d4-a716-446655440000";
const repositoryMechId = "550e8400-e29b-41d4-a716-446655440001";
const deckId = "550e8400-e29b-41d4-a716-446655440010";

test.use({ viewport: { width: 870, height: 760 } });

function success(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data }),
  };
}

async function mockDeckApi(page: Page) {
  const emptyRow = (slot: number) => ({
    slot,
    primary: [],
    alternates: [],
    lance: "",
    mech: "",
    chassis: "",
    variant: "",
    weaponry: "",
    equipmentText: "",
    buildUrl: "",
    buildCode: "",
    role: "",
    skillTree: "",
  });
  const rows = Array.from({ length: 8 }, (_, index) => emptyRow(index + 1));
  for (let index = 0; index < 5; index += 1) {
    rows[index] = {
      ...rows[index],
      mech: staleMechId,
      buildCode: "LEGACY-CODE",
      weaponry: "11x C-Micro Pulse Laser",
    };
  }

  const deckDoc = (name = "Firefox regression") => ({
    id: deckId,
    comp: "CS26",
    map: "Alpine Peaks",
    side: "1",
    name,
    description: "",
    deck: rows,
    revision: 1,
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    updatedBy: "Pilot",
    schemaVersion: "1.0.0",
    docType: "dropDeck",
  });

  await page.route("**/mechs_config.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      mechs: {
        IS: { LIGHT: {}, MEDIUM: {}, HEAVY: {}, ASSAULT: {} },
        Clan: {
          LIGHT: {
            Firemoth: {
              chassis_name: "Firemoth",
              tonnage: 20,
              chassis_code: "FMT",
              variants: ["FMT-H"],
            },
          },
          MEDIUM: {},
          HEAVY: {},
          ASSAULT: {},
        },
      },
    }),
  }));

  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith("/api/")) return route.continue();
    if (pathname === "/api/auth/me") {
      return route.fulfill(success({ id: "pilot-user", username: "Pilot", roles: ["pilot"], appRole: "Pilot" }));
    }
    if (pathname === "/api/auth/config") return route.fulfill(success({ clientId: "12345678901234567" }));
    if (pathname === "/api/decks") {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON() as ReturnType<typeof deckDoc>;
        return route.fulfill(success({ ...deckDoc(payload.name), ...payload, revision: 2 }));
      }
      return route.fulfill(success([deckDoc()]));
    }
    if (pathname === "/api/mechs") {
      return route.fulfill(success([{
        id: repositoryMechId,
        chassis: "Firemoth",
        variant: "FMT-H",
        name: "Legacy recovered",
        role: "Brawler",
        class: "Light",
        tech: "Clan",
        tonnage: 20,
        weaponry: "11x C-Micro Pulse Laser",
        buildCodes: { main: "LEGACY-CODE" },
        skillCode: "pending",
        metadata: {
          equipment: [],
          ranges: { optimal: 0, max: 0, idealMin: 0, idealMax: 0 },
          heat: { generation: 0, capacity: 0, dissipation: 0 },
          dps: { sustained: 0, max: 0 },
        },
        description: "",
        schemaVersion: "1.0",
        docType: "mech",
      }]));
    }
    if (pathname === "/api/quickslots") {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON() as { id: string; slots: unknown[] };
        return route.fulfill(success({ ...payload, overviewSelectedDeckIds: [] }));
      }
      return route.fulfill(success({
        id: "quickslots-default",
        slots: [{ map: "Alpine Peaks", slot: "A", deckId }],
        overviewSelectedDeckIds: [],
      }));
    }
    if (pathname === "/api/presence") return route.fulfill(success({ presence: [] }));
    if (pathname === "/api/presence/me") {
      return route.fulfill(success({
        id: "presence-pilot-user",
        comp: "CS26",
        teamId: "EXD8",
        userId: "pilot-user",
        userName: "Pilot",
        role: "Pilot",
        view: "decks",
        route: "/",
        status: "active",
        updatedAt: "2026-08-23T00:00:00.000Z",
        expiresAt: "2026-08-23T00:05:00.000Z",
        schemaVersion: "1.0.0",
        docType: "presence",
      }));
    }
    return route.fulfill(success([]));
  });
}

test.describe("DeckBoard Firefox regressions", () => {
  test("allows Pilot editing and resolves a stale mech UUID", async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("requestfailed", (request) => runtimeErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
    await mockDeckApi(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const modeButton = page.locator('button[aria-label^="Deck mode:"]');
    await expect(modeButton, runtimeErrors.join("\n")).toHaveAttribute("aria-label", "Deck mode: Editing");
    await expect(modeButton).toBeEnabled();
    await expect(page.getByLabel("Mech Source")).toHaveCount(0);
    await expect(page.getByText("Code", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Skill", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Repo", { exact: true }).first()).toBeVisible();
    await modeButton.click();

    await expect(modeButton, runtimeErrors.join("\n")).toBeVisible();
    await expect(modeButton).toHaveAttribute("aria-label", "Deck mode: Viewing");
    await expect(modeButton).toBeEnabled();
    await expect(modeButton).toHaveCSS("color", "rgb(183, 201, 238)");

    const modeBox = await modeButton.boundingBox();
    expect(modeBox).not.toBeNull();
    expect(modeBox!.x).toBeGreaterThanOrEqual(0);
    expect(modeBox!.x + modeBox!.width).toBeLessThanOrEqual(870);

    const deckNameInput = page.getByLabel("Deck Name");
    await expect(deckNameInput).toBeDisabled();
    await expect(page.locator('.MuiSelect-select[aria-disabled="true"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear" }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Duplicate Deck" }).first()).toBeDisabled();
    await modeButton.click();
    await expect(modeButton).toHaveAttribute("aria-label", "Deck mode: Editing");
    await expect(deckNameInput).toBeEnabled();
    await expect(page.getByRole("button", { name: "Delete Deck" })).toHaveCount(0);

    const deckWrite = page.waitForRequest((request) => request.url().endsWith("/api/decks") && request.method() === "POST");
    await deckNameInput.fill("Pilot edited deck");
    expect((await deckWrite).postDataJSON()).toMatchObject({ name: "Pilot edited deck" });

    await expect(page.getByText("Firemoth / FMT-H / Legacy recovered").first()).toBeVisible();
    await expect(page.getByText("20 t", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(staleMechId, { exact: false })).toHaveCount(0);

    const exportInput = page.getByRole("textbox", { name: "Export code slot 6" });
    const skillInput = page.getByRole("textbox", { name: "Skill tree code slot 1" });
    await expect(page.getByRole("textbox", { name: "Export code slot 1" })).toHaveCount(0);
    await expect(exportInput).toHaveValue("");
    await expect(skillInput).toHaveValue("");
    await expect(page.getByRole("button", { name: "Copy export code slot 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy skill tree code slot 1" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open repository build slot 1" })).toBeVisible();

    const exportWrite = page.waitForRequest((request) => {
      if (!request.url().endsWith("/api/decks") || request.method() !== "POST") return false;
      return request.postDataJSON().deck?.[5]?.buildCode === "DECK-EXPORT";
    });
    await exportInput.fill("DECK-EXPORT");
    expect((await exportWrite).postDataJSON().deck[5]).toMatchObject({ buildCode: "DECK-EXPORT" });

    const skillWrite = page.waitForRequest((request) => {
      if (!request.url().endsWith("/api/decks") || request.method() !== "POST") return false;
      return request.postDataJSON().deck?.[0]?.skillTree === "DECK-SKILL";
    });
    await skillInput.fill("DECK-SKILL");
    expect((await skillWrite).postDataJSON().deck[0]).toMatchObject({ skillTree: "DECK-SKILL" });
    await expect(page.getByRole("button", { name: "Copy skill tree code slot 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy export code slot 6" })).toBeVisible();

    await modeButton.click();
    await expect(exportInput).toHaveCount(0);
    await expect(skillInput).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy export code slot 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy export code slot 6" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy skill tree code slot 1" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(870);
    await modeButton.click();

    const quickslotWrite = page.waitForRequest((request) => request.url().endsWith("/api/quickslots") && request.method() === "POST");
    await page.getByRole("button", { name: "Clear" }).first().click();
    expect((await quickslotWrite).postDataJSON()).toMatchObject({ id: "quickslots-default", slots: [] });

    await page.getByRole("button", { name: "Maproom", exact: true }).click();
    await expect(page.getByLabel("Maproom URL")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save Link" })).toHaveCount(0);

    expect(runtimeErrors).toEqual([]);
  });
});
