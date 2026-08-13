import { HttpRequest } from "@azure/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Discord auth handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DISCORD_CLIENT_ID", "client-id");
    vi.stubEnv("DISCORD_CLIENT_SECRET", "client-secret");
    vi.stubEnv("DISCORD_GUILD_ID", "guild-id");
    vi.stubEnv("DISCORD_ROLE_TL", "tl-role");
    vi.stubEnv("DISCORD_ROLE_PILOT", "pilot-role");
    vi.stubEnv("SESSION_SECRET", "session-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function importHandlers() {
    return import("../../../../src/functions/auth/index.js");
  }

  function oauthRequest() {
    return new HttpRequest({
      method: "POST",
      url: "https://example.com/api/auth/discord",
      body: { string: JSON.stringify({ code: "oauth-code", redirectUri: "https://example.com" }) },
    });
  }

  it("issues a secure session cookie for a mapped Discord role", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("oauth2/token")) return Response.json({ access_token: "access-token" });
      if (url.endsWith("users/@me")) return Response.json({ id: "user-id", username: "pilot" });
      if (url.includes("/member")) return Response.json({ roles: ["pilot-role"] });
      throw new Error(`Unexpected fetch: ${url}`);
    }));
    const { discordOAuthHandler } = await importHandlers();

    const response = await discordOAuthHandler(oauthRequest());

    expect(response.status).toBe(200);
    expect(response.cookies?.[0]).toMatchObject({
      name: "__Host-exd8_session",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
  });

  it("denies an unmapped Discord member without issuing a cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("oauth2/token")) return Response.json({ access_token: "access-token" });
      if (url.endsWith("users/@me")) return Response.json({ id: "user-id", username: "outsider" });
      if (url.includes("/member")) return Response.json({ roles: ["other-role"] });
      throw new Error(`Unexpected fetch: ${url}`);
    }));
    const { discordOAuthHandler } = await importHandlers();

    const response = await discordOAuthHandler(oauthRequest());

    expect(response.status).toBe(403);
    expect(response.cookies).toBeUndefined();
  });

  it("validates the issued cookie through auth/me", async () => {
    const { authMeHandler } = await importHandlers();
    const { encodeSessionToken } = await import("../../../../src/functions/auth/session.js");
    const token = encodeSessionToken({
      id: "user-id",
      username: "pilot",
      roles: ["pilot-role"],
      appRole: "Pilot",
    }, "session-secret");
    const request = new HttpRequest({
      method: "GET",
      url: "https://example.com/api/auth/me",
      headers: { cookie: `__Host-exd8_session=${token}` },
    });

    const response = await authMeHandler(request);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({ data: { id: "user-id", appRole: "Pilot" } });
  });

  it("expires both production and local cookie names on logout", async () => {
    const { authLogoutHandler } = await importHandlers();

    const response = await authLogoutHandler();

    expect(response.cookies.map((cookie) => cookie.name)).toEqual([
      "__Host-exd8_session",
      "exd8_session",
    ]);
    expect(response.cookies.every((cookie) => cookie.maxAge === 0)).toBe(true);
  });
});
