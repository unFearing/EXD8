import { expect, test, type Page } from "@playwright/test";

const firstDeckId = "550e8400-e29b-41d4-a716-446655440000";
const secondDeckId = "550e8400-e29b-41d4-a716-446655440001";
const kitlaanSkillCode = "aff4f5ef742967c910149cdf5ef6a76a0525a0000604b030a100080000000";
const kitlaanSkillTreeUrl = `https://kitlaan.gitlab.io/mwoskill2/#/C/${kitlaanSkillCode}`;

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

const duplicateWeaponBuilds = [
  {
    id: "550e8400-e29b-41d4-a716-446655440010",
    chassis: "Flea",
    variant: "FLE-R5K",
    name: "ROMEO 5000",
    weaponry: "4x Medium Laser",
    buildCodes: { default: "HIDDEN-EXPORT-CODE-ONE" },
    submittedAt: "2026-07-01T12:00:00.000Z",
    role: "Skirmisher",
    class: "Light",
    tonnage: 20,
    skillCode: "pending",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440011",
    chassis: "Flea",
    variant: "FLE-R5K",
    name: "ROMEO 5000 XL",
    weaponry: "4x Medium Laser",
    buildCodes: { default: "HIDDEN-EXPORT-CODE-TWO" },
    submittedAt: "2026-08-02T12:00:00.000Z",
    suggestedBuild: true,
    link: "https://mwo.nav-alpha.com/mechlab?b=example",
    role: "Skirmisher",
    class: "Light",
    tech: "Clan",
    tonnage: 20,
    skillCode: "pending",
    skillTreeCode: kitlaanSkillCode,
    skillTreeUrl: kitlaanSkillTreeUrl,
    primaryRangeBracket: [180, 360],
    optimalRange: 300,
    maxRange: 540,
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
    if (url.pathname.endsWith("/api/mechs/hierarchy")) return success([
      {
        class: "Light",
        buildCount: 2,
        chassis: [
          {
            chassis: "Flea",
            buildCount: 2,
            variants: [{ variant: "FLE-R5K", buildCount: 2, builds: duplicateWeaponBuilds.map((build) => ({ id: build.id, markdown: "" })) }],
          },
        ],
      },
    ]);
    if (url.pathname.startsWith("/api/mechs/") && request.method() === "PUT") {
      const id = url.pathname.split("/").pop();
      return success({ ...request.postDataJSON(), id });
    }
    if (url.pathname.endsWith("/api/mechs")) return success(duplicateWeaponBuilds);
    if (url.pathname.endsWith("/api/config/maps")) return success([]);
    if (url.pathname.endsWith("/api/config/mech-roles")) return success([]);
    return success([]);
  });
}

async function fillMinimumManualBuild(page: Page, skillTreeInput: string) {
  await page.getByRole("button", { name: "Add Build" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a Build" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("switch", { name: "Manual Input" }).click();
  await expect(dialog.getByLabel("Chassis")).toBeVisible();
  await dialog.getByLabel("Chassis").fill("Flea");
  await dialog.getByLabel("Variant").fill("FLE-R5K");
  await dialog.getByLabel("Weaponry (critical)").fill("4x Medium Laser");
  await dialog.getByText("Advanced Fields", { exact: true }).click();
  await dialog.getByLabel("Skill Tree Code or Kitlaan URL").fill(skillTreeInput);
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

test("top navbar remains usable while scrolling every view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await mockApi(page);

  for (const path of ["/", "/repository", "/overview"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const navbar = page.getByTestId("top-navbar");
    await expect(navbar).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const navbarBox = await navbar.boundingBox();
    expect(navbarBox).not.toBeNull();
    expect(Math.abs(navbarBox!.y)).toBeLessThan(1);
    await expect(navbar.getByRole("tab", { name: "Repository" })).toBeVisible();
    await expect(navbar.getByRole("button", { name: "Editing" })).toBeVisible();
    await expect(navbar.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  }
});

test("light mode uses one dimmed shell palette across all views", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ui-theme-mode", "light"));
  await mockApi(page);

  const viewColors: Array<{ backgroundColor: string; backgroundImage: string; appBar: string }> = [];
  for (const path of ["/", "/repository", "/overview"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    viewColors.push(await page.evaluate(() => {
      const shell = document.querySelector("#root > div");
      const appBar = document.querySelector("header");
      if (!shell || !appBar) throw new Error("View shell or app bar not found");
      const shellStyle = getComputedStyle(shell);
      return {
        backgroundColor: shellStyle.backgroundColor,
        backgroundImage: shellStyle.backgroundImage,
        appBar: getComputedStyle(appBar).backgroundColor,
      };
    }));
  }

  expect(new Set(viewColors.map((colors) => JSON.stringify(colors))).size).toBe(1);
  expect(viewColors[0].backgroundColor).toBe("rgb(213, 221, 231)");
  expect(viewColors[0].appBar).toBe("rgba(217, 226, 238, 0.95)");
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

test("Deck build picker shows shortnames and dates without export codes", async ({ page }) => {
  await mockApi(page);
  await page.goto("/", { waitUntil: "networkidle" });

  const buildInput = page.getByPlaceholder("Build").first();
  await buildInput.click();

  const options = page.getByRole("option");
  await expect(options.filter({ hasText: "FLE-R5K / ROMEO 5000 | 4x Medium Laser" })).toBeVisible();
  await expect(options.filter({ hasText: "FLE-R5K / ROMEO 5000 XL | 4x Medium Laser" })).toBeVisible();
  await expect(options.filter({ hasText: "Submitted" })).toHaveCount(2);
  await expect(options.first().getByLabel("Suggested build")).toBeVisible();
  await expect(options.first()).toContainText("ROMEO 5000 XL");
  await expect(page.getByText("HIDDEN-EXPORT-CODE-ONE")).toHaveCount(0);
  await expect(page.getByText("HIDDEN-EXPORT-CODE-TWO")).toHaveCount(0);

  await options.filter({ hasText: "ROMEO 5000 XL" }).click();
  await expect(buildInput).toHaveValue("4x Medium Laser");
  await expect(page.getByText("HIDDEN-EXPORT-CODE-TWO")).toBeVisible();
  await expect(page.getByText("HIDDEN-EXPORT-CODE-ONE")).toHaveCount(0);
  await expect(page.locator(`input[value="${kitlaanSkillCode}"]`)).toBeVisible();
});

test("Repository prioritizes suggested builds and supports complete build editing", async ({ page }) => {
  await mockApi(page);
  await page.goto("/repository", { waitUntil: "networkidle" });

  const cards = page.locator('[id^="repo-mech-"]');
  await expect(cards.first()).toHaveAttribute("id", `repo-mech-${duplicateWeaponBuilds[1].id}`);
  const suggestedCard = page.locator(`#repo-mech-${duplicateWeaponBuilds[1].id}`);
  await expect(suggestedCard.getByText("Ideal: 180-360 m | Optimal: 300 m | Max: 540 m")).toBeVisible();
  await expect(suggestedCard.getByRole("link", { name: "Open skill tree" })).toHaveAttribute("href", kitlaanSkillTreeUrl);
  await expect(suggestedCard.getByRole("link", { name: "Open build" })).toBeVisible();

  const suggestedCheckbox = suggestedCard.getByRole("checkbox", { name: "Suggested build" });
  const roleInput = suggestedCard.getByRole("textbox", { name: "Role" });
  const nameInput = suggestedCard.getByPlaceholder("Optional short name");
  await expect(suggestedCheckbox).toBeChecked();
  await expect(roleInput).toHaveValue("Skirmisher");

  const headerBottom = Math.max(
    (await suggestedCheckbox.boundingBox())?.y ?? 0,
    (await roleInput.boundingBox())?.y ?? 0,
  );
  expect((await nameInput.boundingBox())?.y).toBeGreaterThan(headerBottom);

  await suggestedCheckbox.uncheck();
  await roleInput.fill("Flanker");
  const updateRequest = page.waitForRequest((request) => request.url().endsWith(`/api/mechs/${duplicateWeaponBuilds[1].id}`) && request.method() === "PUT");
  await suggestedCard.getByRole("button", { name: "Save Build" }).click();
  expect((await updateRequest).postDataJSON()).toMatchObject({
    suggestedBuild: false,
    role: "Flanker",
    skillTreeCode: kitlaanSkillCode,
    skillTreeUrl: kitlaanSkillTreeUrl,
  });

  const skillCodeInput = suggestedCard.getByRole("textbox", { name: "Skill Tree Code" });
  const buildCodesInput = suggestedCard.getByRole("textbox", { name: "Build Codes (key: value per line)" });
  const skillCodeBox = await skillCodeInput.boundingBox();
  const buildCodesBox = await buildCodesInput.boundingBox();
  expect(skillCodeBox && buildCodesBox && skillCodeBox.y + skillCodeBox.height <= buildCodesBox.y).toBe(true);

  await page.getByRole("button", { name: "Add Build" }).click();
  await page.getByRole("switch", { name: "Manual Input" }).click();
  await expect(page.getByRole("switch", { name: "Suggested build" })).toBeVisible();
  await page.getByText("Advanced Fields", { exact: true }).click();
  const skillTreeInput = page.getByRole("textbox", { name: "Skill Tree Code or Kitlaan URL" });
  await expect(page.getByText("Paste either a raw skill tree code or a full Kitlaan skill tree link.")).toBeVisible();
  await skillTreeInput.fill(kitlaanSkillTreeUrl);
  await expect(skillTreeInput).toHaveValue(kitlaanSkillTreeUrl);
});

test("Repository view mode contains long codes and spreads metadata", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApi(page);
  await page.goto("/repository?view=view", { waitUntil: "networkidle" });

  const card = page.locator(`#repo-mech-${duplicateWeaponBuilds[1].id}`);
  const skillCode = card.locator("code").filter({ hasText: kitlaanSkillCode });
  await expect(skillCode).toBeVisible();

  const codeDimensions = await skillCode.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.getBoundingClientRect().height,
  }));
  expect(codeDimensions.scrollWidth).toBeLessThanOrEqual(codeDimensions.clientWidth);
  expect(codeDimensions.height).toBeGreaterThan(24);

  const rangeBox = await page.getByTestId(`repo-range-${duplicateWeaponBuilds[1].id}`).boundingBox();
  const sourceBox = await page.getByTestId(`repo-source-${duplicateWeaponBuilds[1].id}`).boundingBox();
  expect(rangeBox && sourceBox && Math.abs(rangeBox.y - sourceBox.y) < 2).toBe(true);

  const skillCodeBox = await page.getByTestId(`repo-skill-code-${duplicateWeaponBuilds[1].id}`).boundingBox();
  const defaultCodeBox = await page.getByTestId(`repo-build-code-${duplicateWeaponBuilds[1].id}-default`).boundingBox();
  expect(skillCodeBox && defaultCodeBox && defaultCodeBox.y - (skillCodeBox.y + skillCodeBox.height) >= 10).toBe(true);

  const rangedSourceRows = await Promise.all([
    page.getByTestId(`repo-submitter-${duplicateWeaponBuilds[1].id}`).boundingBox(),
    page.getByTestId(`repo-mechdb-${duplicateWeaponBuilds[1].id}`).boundingBox(),
    page.getByTestId(`repo-kitlaan-${duplicateWeaponBuilds[1].id}`).boundingBox(),
  ]);
  expect(
    rangedSourceRows.every(Boolean) &&
    rangedSourceRows[0]!.y < rangedSourceRows[1]!.y &&
    rangedSourceRows[1]!.y < rangedSourceRows[2]!.y,
  ).toBe(true);

  const inlineSourceFields = await Promise.all([
    page.getByTestId(`repo-submitter-${duplicateWeaponBuilds[0].id}`).boundingBox(),
    page.getByTestId(`repo-mechdb-${duplicateWeaponBuilds[0].id}`).boundingBox(),
    page.getByTestId(`repo-kitlaan-${duplicateWeaponBuilds[0].id}`).boundingBox(),
  ]);
  expect(inlineSourceFields.every(Boolean) && inlineSourceFields.every((box) => Math.abs(box!.y - inlineSourceFields[0]!.y) < 2)).toBe(true);
  expect(inlineSourceFields[1]!.x - (inlineSourceFields[0]!.x + inlineSourceFields[0]!.width)).toBeGreaterThanOrEqual(24);
  expect(inlineSourceFields[2]!.x - (inlineSourceFields[1]!.x + inlineSourceFields[1]!.width)).toBeGreaterThanOrEqual(24);

  const pageWidth = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(pageWidth.document).toBeLessThanOrEqual(pageWidth.viewport);
});

for (const inputCase of [
  {
    name: "raw skill code",
    value: kitlaanSkillCode,
    expectedUrl: `https://kitlaan.gitlab.io/mwoskill2/#/I/${kitlaanSkillCode}`,
    expectedTech: "IS",
  },
  { name: "Kitlaan link", value: kitlaanSkillTreeUrl, expectedUrl: kitlaanSkillTreeUrl, expectedTech: "Clan" },
]) {
  test(`Add Build canonicalizes a ${inputCase.name} on submission`, async ({ page }) => {
    await mockApi(page);
    await page.goto("/repository", { waitUntil: "networkidle" });
    await fillMinimumManualBuild(page, inputCase.value);

    const createRequest = page.waitForRequest((request) => request.url().endsWith("/api/mechs") && request.method() === "POST");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect((await createRequest).postDataJSON()).toMatchObject({
      skillCode: kitlaanSkillCode,
      skillTreeCode: kitlaanSkillCode,
      skillTreeUrl: inputCase.expectedUrl,
      tech: inputCase.expectedTech,
    });
  });
}

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
