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
  rows[0] = {
    ...rows[0],
    mech: staleMechId,
    buildCode: "LEGACY-CODE",
    weaponry: "11x C-Micro Pulse Laser",
  };

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
      return route.fulfill(success([{
        id: deckId,
        comp: "CS26",
        map: "Alpine Peaks",
        side: "1",
        name: "Firefox regression",
        description: "",
        deck: rows,
        revision: 1,
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
        updatedBy: "Pilot",
        schemaVersion: "1.0.0",
        docType: "dropDeck",
      }]));
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
      return route.fulfill(success({
        id: "quickslots-default",
        slots: [{ map: "Alpine Peaks", slot: "A", deckId }],
        overviewSelectedDeckIds: [],
      }));
    }
    if (pathname === "/api/presence") return route.fulfill(success({ presence: [] }));
    if (pathname === "/api/presence/me") return route.fulfill(success({}));
    return route.fulfill(success([]));
  });
}

test.describe("DeckBoard Firefox regressions", () => {
  test("shows viewing mode and resolves a stale mech UUID", async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("requestfailed", (request) => runtimeErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
    await mockDeckApi(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const modeButton = page.getByRole("button", { name: "Deck mode: Viewing" });
    await expect(modeButton, runtimeErrors.join("\n")).toBeVisible();
    await expect(modeButton).toBeDisabled();
    await expect(modeButton).toHaveCSS("color", "rgb(183, 201, 238)");

    const modeBox = await modeButton.boundingBox();
    expect(modeBox).not.toBeNull();
    expect(modeBox!.x).toBeGreaterThanOrEqual(0);
    expect(modeBox!.x + modeBox!.width).toBeLessThanOrEqual(870);

    await expect(page.getByText("Firemoth / FMT-H / Legacy recovered")).toBeVisible();
    await expect(page.getByText("20 t", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(staleMechId, { exact: false })).toHaveCount(0);
  });
});