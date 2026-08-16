import { HttpRequest } from "@azure/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("production auth guard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_DISCORD_AUTH", "false");
    vi.stubEnv("SESSION_SIGNING_KEY", "test-signing-key");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("DISCORD_ROLE_TL", "tl-role");
    vi.stubEnv("DISCORD_ROLE_PILOT", "pilot-role");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects spoofed identity headers without a session cookie", async () => {
    const { getRequestContext } = await import("../../../src/middleware/authGuard.js");
    const request = new HttpRequest({
      method: "POST",
      url: "https://example.com/api/mechs",
      headers: {
        "x-team-id": "EXD8",
        "x-user-id": "attacker",
        "x-user-role": "TL",
      },
    });

    expect(() => getRequestContext(request)).toThrow("AUTH_REQUIRED");
  });

  it("does not enable header auth in production through the local bypass flag", async () => {
    vi.stubEnv("DISABLE_DISCORD_AUTH", "true");
    const { getRequestContext } = await import("../../../src/middleware/authGuard.js");
    const request = new HttpRequest({
      method: "GET",
      url: "https://example.com/api/mechs",
      headers: {
        "x-team-id": "EXD8",
        "x-user-id": "attacker",
        "x-user-role": "TL",
      },
    });

    expect(() => getRequestContext(request)).toThrow("AUTH_REQUIRED");
  });

  it("derives identity and role from the signed cookie", async () => {
    const { encodeSessionToken } = await import("../../../src/functions/auth/session.js");
    const { getRequestContext } = await import("../../../src/middleware/authGuard.js");
    const token = encodeSessionToken({
      id: "discord-user",
      username: "pilot",
      avatar: "trusted-avatar",
      roles: ["pilot-role"],
      appRole: "Pilot",
    }, "test-signing-key");
    const request = new HttpRequest({
      method: "POST",
      url: "https://example.com/api/mechs",
      headers: {
        cookie: `__Host-exd8_session=${token}`,
        "x-team-id": "EXD8",
        "x-user-id": "attacker",
        "x-user-role": "TL",
      },
    });

    expect(getRequestContext(request)).toEqual({
      teamId: "EXD8",
      role: "Pilot",
      userId: "discord-user",
      userName: "pilot",
      avatar: "trusted-avatar",
    });
    expect(() => getRequestContext(request, "write")).toThrow("FORBIDDEN_WRITE");
  });
});
