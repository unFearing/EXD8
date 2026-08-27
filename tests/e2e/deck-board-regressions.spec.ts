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

type DeckApiMockOptions = {
  appRole?: "Pilot" | "TL";
  deckSaveGates?: Promise<void>[];
  parseRequests?: string[];
  repositoryCreateRequests?: unknown[];
  parseGate?: Promise<void>;
  parseGates?: Record<string, Promise<void>>;
  parseFailure?: boolean;
  parseResult?: typeof parsedBuild;
};

const parsedBuild = {
  sourceUrl: "https://nav-alpha.com/mechlab?b=adhoc",
  warnings: [],
  metadata: { provider: "nav-alpha" },
  draft: {
    chassis: "Timber Wolf",
    variant: "TBR-S",
    name: "Ad-hoc build",
    link: "https://nav-alpha.com/mechlab?b=adhoc",
    weaponry: "2x C-Large Pulse Laser",
    description: "",
    role: "Skirmisher",
    buildCodes: { default: "DEFAULT-CODE", export: "ADHOC-EXPORT" },
    skillCode: "pending",
    skillTreeCode: "ADHOC-SKILL",
    metadata: {
      equipment: ["C-Targeting Computer 1", "C-Light Active Probe"],
      ranges: { optimal: 0, max: 0, idealMin: 0, idealMax: 0 },
      heat: { generation: 0, capacity: 0, dissipation: 0 },
      dps: { sustained: 0, max: 0 },
    },
    class: "Heavy",
    tech: "Clan",
    tonnage: 75,
  },
};

async function dispatchTextGesture(page: Page, inputIndex: number, type: "paste" | "drop", text: string, dataType = "text") {
  return page.getByPlaceholder("Build").nth(inputIndex).evaluate((element, eventData) => {
    const transfer = new DataTransfer();
    transfer.setData(eventData.dataType, eventData.text);
    let dragOverPrevented = false;
    if (eventData.type === "drop") {
      const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
      Object.defineProperty(dragOver, "dataTransfer", { value: transfer });
      dragOverPrevented = !element.dispatchEvent(dragOver);
    }
    const event = new Event(eventData.type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, eventData.type === "paste" ? "clipboardData" : "dataTransfer", { value: transfer });
    const gesturePrevented = !element.dispatchEvent(event);
    return { dragOverPrevented, gesturePrevented };
  }, { type, text, dataType });
}

async function mockDeckApi(page: Page, options: DeckApiMockOptions = {}) {
  let deckSaveCount = 0;
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
  rows[0] = {
    ...rows[0],
    primary: ["Pilot"],
    alternates: ["Reserve"],
    lance: "A",
  };

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

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith("/api/")) return route.continue();
    if (pathname === "/api/auth/me") {
      const appRole = options.appRole ?? "Pilot";
      return route.fulfill(success({ id: "pilot-user", username: "Pilot", roles: [appRole.toLowerCase()], appRole }));
    }
    if (pathname === "/api/auth/config") return route.fulfill(success({ clientId: "12345678901234567" }));
    if (pathname === "/api/decks") {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON() as ReturnType<typeof deckDoc>;
        await options.deckSaveGates?.[deckSaveCount];
        deckSaveCount += 1;
        return route.fulfill(success({ ...deckDoc(payload.name), ...payload, revision: 2 }));
      }
      return route.fulfill(success([deckDoc()]));
    }
    if (pathname === "/api/mechs/parseBuild") {
      const payload = route.request().postDataJSON() as { url: string };
      options.parseRequests?.push(payload.url);
      await (options.parseGates?.[payload.url] ?? options.parseGate);
      if (options.parseFailure) {
        return route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: { code: "PARSE_FAILED", message: "Unsupported build link" } }),
        });
      }
      return route.fulfill(success({ ...(options.parseResult ?? parsedBuild), sourceUrl: payload.url }));
    }
    if (pathname === "/api/mechs") {
      if (route.request().method() === "POST") {
        options.repositoryCreateRequests?.push(route.request().postDataJSON());
      }
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

    const descriptionInput = page.getByRole("textbox", { name: "Description slot A" });
    const initialInput = page.getByRole("textbox", { name: "Initial slot A" });
    const idealInput = page.getByRole("textbox", { name: "Ideal slot A" });
    await expect(descriptionInput).toBeVisible();
    await expect(initialInput).toBeVisible();
    await expect(idealInput).toBeVisible();

    const descriptionWrite = page.waitForResponse((response) => {
      const request = response.request();
      return request.url().endsWith("/api/decks")
        && request.method() === "POST"
        && request.postDataJSON().description === "Control the center ridge.";
    });
    await descriptionInput.fill("Control the center ridge.");
    expect((await descriptionWrite).request().postDataJSON()).toMatchObject({ description: "Control the center ridge." });

    const initialWrite = page.waitForResponse((response) => {
      const request = response.request();
      return request.url().endsWith("/api/decks")
        && request.method() === "POST"
        && request.postDataJSON().initial === "Scout the river crossing.";
    });
    await initialInput.fill("Scout the river crossing.");
    expect((await initialWrite).request().postDataJSON()).toMatchObject({ initial: "Scout the river crossing." });

    const idealWrite = page.waitForResponse((response) => {
      const request = response.request();
      return request.url().endsWith("/api/decks")
        && request.method() === "POST"
        && request.postDataJSON().ideal === "Collapse on the isolated target.";
    });
    await idealInput.fill("Collapse on the isolated target.");
    expect((await idealWrite).request().postDataJSON()).toMatchObject({ ideal: "Collapse on the isolated target." });

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

  test("preserves newer strategy text when an older autosave response arrives", async ({ page }) => {
    let releaseFirstSave!: () => void;
    const firstSaveGate = new Promise<void>((resolve) => { releaseFirstSave = resolve; });
    await mockDeckApi(page, { deckSaveGates: [firstSaveGate] });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const descriptionInput = page.getByRole("textbox", { name: "Description slot A" });
    const firstSave = page.waitForRequest((request) =>
      request.url().endsWith("/api/decks")
      && request.method() === "POST"
      && request.postDataJSON().description === "First draft",
    );
    await descriptionInput.fill("First draft");
    await firstSave;

    const newerSave = page.waitForResponse((response) => {
      const request = response.request();
      return request.url().endsWith("/api/decks")
        && request.method() === "POST"
        && request.postDataJSON().description === "First draft with newer text"
        && request.postDataJSON().baseRevision === 2;
    });
    await descriptionInput.fill("First draft with newer text");
    releaseFirstSave();

    await expect(descriptionInput).toHaveValue("First draft with newer text");
    await expect(descriptionInput).toBeFocused();
    await newerSave;
    await expect(descriptionInput).toHaveValue("First draft with newer text");
    await expect(descriptionInput).toBeFocused();
  });

  test("keeps TL Maproom controls aligned and width-safe", async ({ page }) => {
    await mockDeckApi(page, { appRole: "TL" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    for (const width of [1440, 870, 600, 320]) {
      await page.setViewportSize({ width, height: 760 });
      await page.getByRole("button", { name: "Static", exact: true }).click();
      const staticModeBounds = await page.getByRole("button", { name: "Maproom", exact: true }).boundingBox();
      await page.getByRole("button", { name: "Maproom", exact: true }).click();
      const maproomModeBounds = await page.getByRole("button", { name: "Maproom", exact: true }).boundingBox();
      expect(staticModeBounds).not.toBeNull();
      expect(maproomModeBounds).not.toBeNull();
      expect(Math.abs(maproomModeBounds!.x - staticModeBounds!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(maproomModeBounds!.y - staticModeBounds!.y)).toBeLessThanOrEqual(1);
      await expect(page.getByRole("button", { name: "Save Link" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      const urlBounds = await page.getByLabel("Maproom URL").boundingBox();
      const saveBounds = await page.getByRole("button", { name: "Save Link" }).boundingBox();
      const viewportControls = await Promise.all(
        ["Zoom"].map((label) => page.getByLabel(label).boundingBox()),
      );
      expect(urlBounds).not.toBeNull();
      expect(saveBounds).not.toBeNull();
      expect(viewportControls.every((bounds) => bounds !== null)).toBe(true);

      for (const bounds of [urlBounds!, saveBounds!, ...viewportControls.map((bounds) => bounds!)]) {
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      }
      for (let index = 1; index < viewportControls.length; index += 1) {
        const previous = viewportControls[index - 1]!;
        const current = viewportControls[index]!;
        expect(Math.abs(current.y - previous.y)).toBeLessThanOrEqual(1);
        expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.width);
      }
      if (width >= 600) {
        expect(saveBounds!.x).toBeGreaterThanOrEqual(urlBounds!.x + urlBounds!.width);
        expect(Math.abs(saveBounds!.y - urlBounds!.y)).toBeLessThanOrEqual(1);
      } else {
        expect(saveBounds!.y).toBeGreaterThanOrEqual(urlBounds!.y + urlBounds!.height);
      }
      if (width >= 900) {
        expect(viewportControls[0]!.x).toBeGreaterThanOrEqual(saveBounds!.x + saveBounds!.width);
        expect(Math.abs(viewportControls[0]!.y - urlBounds!.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  test("parses a pasted build URL into only the targeted row and autosaves it", async ({ page }) => {
    const parseRequests: string[] = [];
    const repositoryCreateRequests: unknown[] = [];
    let releaseParse!: () => void;
    const parseGate = new Promise<void>((resolve) => { releaseParse = resolve; });
    await mockDeckApi(page, { parseRequests, repositoryCreateRequests, parseGate });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const deckWrite = page.waitForRequest((request) => {
      if (!request.url().endsWith("/api/decks") || request.method() !== "POST") return false;
      return request.postDataJSON().deck?.[0]?.buildCode === "ADHOC-EXPORT";
    });
    await dispatchTextGesture(page, 0, "paste", "https://nav-alpha.com/mechlab?b=adhoc");
    await expect(page.getByRole("progressbar", { name: "Parsing build link" })).toBeVisible();
    expect(parseRequests).toEqual(["https://nav-alpha.com/mechlab?b=adhoc"]);
    releaseParse();

    await expect(page.getByPlaceholder("Build").first()).toHaveValue("2x C-Large Pulse Laser");
    await expect(page.getByText("75 t", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy export code slot 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy skill tree code slot 1" })).toBeVisible();
    const savedRow = (await deckWrite).postDataJSON().deck[0];
    expect(savedRow).toMatchObject({
      slot: 1,
      primary: ["Pilot"],
      alternates: ["Reserve"],
      lance: "A",
      mech: "",
      chassis: "Timber Wolf",
      variant: "TBR-S",
      weaponry: "2x C-Large Pulse Laser",
      equipmentText: "C-Targeting Computer 1, C-Light Active Probe",
      buildUrl: "https://nav-alpha.com/mechlab?b=adhoc",
      role: "Skirmisher",
      buildCode: "ADHOC-EXPORT",
      skillTree: "ADHOC-SKILL",
      tonnage: 75,
    });
    expect(savedRow.slot).toBe(1);
    expect((await deckWrite).postDataJSON().deck[1]).toMatchObject({
      slot: 2,
      buildCode: "LEGACY-CODE",
      weaponry: "11x C-Micro Pulse Laser",
    });
    expect(repositoryCreateRequests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(870);
  });

  test("parses a dropped build URL", async ({ page }) => {
    const parseRequests: string[] = [];
    await mockDeckApi(page, { parseRequests });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const gesture = await dispatchTextGesture(page, 1, "drop", "https://nav-alpha.com/mechlab?b=dropped", "text/uri-list");
    expect(gesture.dragOverPrevented).toBe(true);
    expect(gesture.gesturePrevented).toBe(true);
    await expect(page.getByPlaceholder("Build").nth(1)).toHaveValue("2x C-Large Pulse Laser");
    expect(parseRequests).toEqual(["https://nav-alpha.com/mechlab?b=dropped"]);
  });

  test("keeps ordinary text behavior and preserves the row when parsing fails", async ({ page }) => {
    const parseRequests: string[] = [];
    await mockDeckApi(page, { parseRequests, parseFailure: true });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const ordinaryBuild = page.getByPlaceholder("Build").nth(1);
    const ordinaryPaste = await dispatchTextGesture(page, 1, "paste", "Custom free-text build");
    expect(ordinaryPaste.gesturePrevented).toBe(false);
    await ordinaryBuild.fill("Custom free-text build");
    await expect(ordinaryBuild).toHaveValue("Custom free-text build");
    expect(parseRequests).toEqual([]);

    await dispatchTextGesture(page, 0, "paste", "https://unsupported.example/build/123");
    await expect(page.getByRole("alert")).toContainText("Could not parse build link for slot 1: Unsupported build link");
    await expect(page.getByPlaceholder("Build").first()).toBeEnabled();
    await expect(page.getByPlaceholder("Build").first()).toHaveValue("11x C-Micro Pulse Laser");
    await expect(page.getByText("20 t", { exact: true }).first()).toBeVisible();
    expect(parseRequests).toEqual(["https://unsupported.example/build/123"]);
  });

  test("keeps concurrent rows loading independently", async ({ page }) => {
    const firstUrl = "https://nav-alpha.com/mechlab?b=first";
    const secondUrl = "https://nav-alpha.com/mechlab?b=second";
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    await mockDeckApi(page, { parseGates: { [firstUrl]: firstGate, [secondUrl]: secondGate } });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await dispatchTextGesture(page, 0, "paste", firstUrl);
    await dispatchTextGesture(page, 1, "paste", secondUrl);
    await expect(page.getByRole("progressbar", { name: "Parsing build link" })).toHaveCount(2);
    releaseSecond();
    await expect(page.getByRole("progressbar", { name: "Parsing build link" })).toHaveCount(1);
    releaseFirst();
    await expect(page.getByRole("progressbar", { name: "Parsing build link" })).toHaveCount(0);
  });

  test("leaves manual code inputs available when parsed codes are missing", async ({ page }) => {
    await mockDeckApi(page, {
      parseResult: {
        ...parsedBuild,
        draft: {
          ...parsedBuild.draft,
          buildCodes: {},
          skillCode: "pending",
          skillTreeCode: "",
        },
      },
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await dispatchTextGesture(page, 1, "paste", "https://nav-alpha.com/mechlab?b=no-codes");
    await expect(page.getByRole("textbox", { name: "Export code slot 2" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Skill tree code slot 2" })).toBeVisible();
  });
});
