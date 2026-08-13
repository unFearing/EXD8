import { expect, test, type Page, type Route } from "@playwright/test";

const protectedPaths = ["/", "/repository", "/overview"];
const staleUser = {
  id: "stale-user",
  username: "Stale Team Lead",
  roles: ["stale-role"],
  appRole: "TL",
};

function trackProtectedRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
      requests.push(pathname);
    }
  });
  return requests;
}

async function seedStaleIdentity(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem("discord_user", JSON.stringify(user));
  }, staleUser);
}

async function mockAuthConfig(page: Page) {
  await page.route("**/api/auth/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { clientId: "12345678901234567" } }),
  }));
}

async function expectSplashOnly(page: Page, protectedRequests: string[]) {
  await expect(page.getByText("Mech Drop Deck Planner")).toBeVisible();
  await expect(page.getByRole("button", { name: /Discord|Authorizing/ })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page.waitForTimeout(50);
  expect(protectedRequests).toEqual([]);
}

for (const path of protectedPaths) {
  test(`${path} remains gated while session validation is pending`, async ({ page }) => {
    const protectedRequests = trackProtectedRequests(page);
    await seedStaleIdentity(page);
    await mockAuthConfig(page);

    let pendingAuthRoute: Route | undefined;
    await page.route("**/api/auth/me", (route) => {
      pendingAuthRoute = route;
    });

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expectSplashOnly(page, protectedRequests);
    expect(pendingAuthRoute).toBeDefined();

    await pendingAuthRoute!.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Unauthorized" } }),
    });
  });

  const rejectedCases = [
    {
      name: "401",
      handle: (route: Route) => route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "Unauthorized" } }),
      }),
      message: "Authentication required. Sign in with Discord to continue.",
    },
    {
      name: "403",
      handle: (route: Route) => route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "Forbidden" } }),
      }),
      message: "Your Discord account is not authorized for this team.",
    },
    {
      name: "server failure",
      handle: (route: Route) => route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "Unavailable" } }),
      }),
      message: "Unable to validate your session. The authentication service returned 503.",
    },
    {
      name: "malformed response",
      handle: (route: Route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { id: "missing-role" } }),
      }),
      message: "The authentication service returned an invalid response. Please retry.",
    },
    {
      name: "network failure",
      handle: (route: Route) => route.abort("failed"),
      message: "Unable to reach the authentication service.",
    },
  ];

  for (const rejectedCase of rejectedCases) {
    test(`${path} remains gated after ${rejectedCase.name}`, async ({ page }) => {
      const protectedRequests = trackProtectedRequests(page);
      await seedStaleIdentity(page);
      await mockAuthConfig(page);
      await page.route("**/api/auth/me", rejectedCase.handle);

      await page.goto(path, { waitUntil: "domcontentloaded" });

      await expectSplashOnly(page, protectedRequests);
      await expect(page.getByText(rejectedCase.message, { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry authentication" })).toBeVisible();
      await page.waitForTimeout(50);
      expect(protectedRequests).toEqual([]);
      expect(await page.evaluate(() => localStorage.getItem("discord_user"))).toBeNull();
      expect(new URL(page.url()).pathname).toBe(path);
    });
  }
}

async function mockAuthenticatedApi(
  page: Page,
  appRole: "TL" | "Pilot",
  onProtectedRequest?: (headers: Record<string, string>) => void,
) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith("/api/")) return route.continue();
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
      onProtectedRequest?.(await route.request().allHeaders());
    }
    const success = (data: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data }),
    });

    if (pathname === "/api/auth/me") {
      return success({
        id: `${appRole.toLowerCase()}-user`,
        username: appRole,
        roles: [`${appRole.toLowerCase()}-role`],
        appRole,
      });
    }
    if (pathname === "/api/auth/config") return success({ clientId: "12345678901234567" });
    if (pathname === "/api/quickslots") {
      return success({ id: "quickslots-default", slots: [], overviewSelectedDeckIds: [] });
    }
    return success([]);
  });
}

for (const appRole of ["TL", "Pilot"] as const) {
  test(`authenticated ${appRole} retains the requested protected path`, async ({ page }) => {
    await mockAuthenticatedApi(page, appRole);

    await page.goto("/overview", { waitUntil: "networkidle" });

    expect(new URL(page.url()).pathname).toBe("/overview");
    await expect(page.getByText("Mech Drop Deck Planner")).not.toBeVisible();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  });
}

test("successful OAuth callback restores the requested protected path", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("discord_oauth_state", "valid-state");
    sessionStorage.setItem("discord_requested_path", "/repository?source=discord#saved");
  });
  await mockAuthenticatedApi(page, "TL");

  await page.goto("/auth/callback?code=discord-code&state=valid-state", { waitUntil: "networkidle" });

  expect(new URL(page.url()).pathname).toBe("/repository");
  expect(new URL(page.url()).search).toBe("?source=discord");
  expect(new URL(page.url()).hash).toBe("#saved");
  await expect(page.getByRole("tab", { name: "Repository" })).toBeVisible();
});

test("logical OAuth exchange failure stays gated", async ({ page }) => {
  const protectedRequests = trackProtectedRequests(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("discord_oauth_state", "valid-state");
    sessionStorage.setItem("discord_requested_path", "/overview");
  });
  await mockAuthConfig(page);
  await page.route("**/api/auth/discord", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: { message: "Discord exchange rejected" } }),
  }));

  await page.goto("/auth/callback?code=discord-code&state=valid-state", { waitUntil: "networkidle" });

  expect(new URL(page.url()).pathname).toBe("/overview");
  await expect(page.getByText("Discord exchange rejected")).toBeVisible();
  await expectSplashOnly(page, protectedRequests);
});

test("invalid OAuth callback state stays gated with a useful error", async ({ page }) => {
  const protectedRequests = trackProtectedRequests(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("discord_oauth_state", "expected-state");
    sessionStorage.setItem("discord_requested_path", "/overview");
  });
  await mockAuthConfig(page);

  await page.goto("/auth/callback?code=discord-code&state=wrong-state", { waitUntil: "networkidle" });

  expect(new URL(page.url()).pathname).toBe("/overview");
  await expect(page.getByText("Invalid Discord login state. Please try again.")).toBeVisible();
  await expectSplashOnly(page, protectedRequests);
});

test("Discord denial restores the requested path and stays gated", async ({ page }) => {
  const protectedRequests = trackProtectedRequests(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("discord_requested_path", "/repository");
  });
  await mockAuthConfig(page);

  await page.goto("/auth/callback?error=access_denied", { waitUntil: "networkidle" });

  expect(new URL(page.url()).pathname).toBe("/repository");
  await expect(page.getByText("Discord sign-in was cancelled or denied. Please try again.")).toBeVisible();
  await expectSplashOnly(page, protectedRequests);
});

test("unrelated code query does not enter OAuth callback handling", async ({ page }) => {
  await mockAuthenticatedApi(page, "TL");

  await page.goto("/?code=deck-filter", { waitUntil: "networkidle" });

  await expect(page.getByRole("tab", { name: "Drop Decks" })).toBeVisible();
});

test("unsafe callback return path falls back to the application root", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("discord_oauth_state", "valid-state");
    sessionStorage.setItem("discord_requested_path", "//example.com/stolen");
  });
  await mockAuthenticatedApi(page, "TL");

  await page.goto("/auth/callback?code=discord-code&state=valid-state", { waitUntil: "networkidle" });

  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:5175");
  expect(new URL(page.url()).pathname).toBe("/");
});

test("retry validates the session without mounting protected views early", async ({ page }) => {
  let authAttempts = 0;
  let allowAuthentication = false;
  const protectedRequests = trackProtectedRequests(page);
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith("/api/")) return route.continue();
    if (pathname === "/api/auth/me") {
      authAttempts += 1;
      if (!allowAuthentication) {
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false }) });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { id: "tl-user", username: "TL", roles: ["tl-role"], appRole: "TL" } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: pathname === "/api/auth/config" ? { clientId: "12345678901234567" } : [] }),
    });
  });

  await page.goto("/repository", { waitUntil: "networkidle" });
  await expectSplashOnly(page, protectedRequests);
  allowAuthentication = true;
  await page.getByRole("button", { name: "Retry authentication" }).click();
  await expect(page.getByRole("tab", { name: "Repository" })).toBeVisible();
  expect(authAttempts).toBeGreaterThanOrEqual(2);
});

test("protected API requests never contain client-authored identity headers", async ({ page }) => {
  const protectedHeaders: Record<string, string>[] = [];
  await mockAuthenticatedApi(page, "TL", (headers) => {
    protectedHeaders.push(headers);
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Drop Decks" })).toBeVisible();

  expect(protectedHeaders.length).toBeGreaterThan(0);
  for (const headers of protectedHeaders) {
    expect(headers["x-user-role"]).toBeUndefined();
    expect(headers["x-user-id"]).toBeUndefined();
  }
});
