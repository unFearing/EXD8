import { describe, expect, it } from "vitest";
import { HttpRequest } from "@azure/functions";
import {
  SESSION_TTL_MS,
  createSessionCookie,
  decodeSessionToken,
  encodeSessionToken,
  getSessionUser,
  resolveMappedRole,
  resolveSessionSigningKey,
  type SessionUser,
} from "../../../../src/functions/auth/session.js";

const user: SessionUser = {
  id: "123456789",
  username: "testuser",
  roles: ["pilot-role"],
  appRole: "Pilot",
};

describe("Discord auth sessions", () => {
  it("prefers the signing key, supports the legacy secret, and derives a stable OAuth fallback", () => {
    expect(resolveSessionSigningKey("signing-key", "legacy-secret", "oauth-secret")).toBe("signing-key");
    expect(resolveSessionSigningKey("", "legacy-secret", "oauth-secret")).toBe("legacy-secret");
    expect(resolveSessionSigningKey("", "", "oauth-secret")).toBe(resolveSessionSigningKey("", "", "oauth-secret"));
    expect(resolveSessionSigningKey("", "", "oauth-secret")).not.toBe("oauth-secret");
    expect(resolveSessionSigningKey("", "", "")).toBe("");
  });

  it("preserves a valid signed session across requests", () => {
    const token = encodeSessionToken(user, "test-secret", 1_000);

    expect(decodeSessionToken(token, "test-secret", 2_000)).toEqual(user);
  });

  it("rejects tampered and expired sessions", () => {
    const token = encodeSessionToken(user, "test-secret", 1_000);
    const tamperedToken = `${token.slice(0, -1)}x`;

    expect(decodeSessionToken(tamperedToken, "test-secret", 2_000)).toBeNull();
    expect(decodeSessionToken(token, "test-secret", 1_000 + SESSION_TTL_MS)).toBeNull();
  });

  it("allows only explicitly mapped Discord roles", () => {
    expect(resolveMappedRole(["tl-role", "pilot-role"], "tl-role", "pilot-role")).toBe("TL");
    expect(resolveMappedRole(["pilot-role"], "tl-role", "pilot-role")).toBe("Pilot");
    expect(resolveMappedRole(["other-role"], "tl-role", "pilot-role")).toBeNull();
    expect(resolveMappedRole(["pilot-role"], "", "")).toBeNull();
    expect(resolveMappedRole(["shared-role"], "shared-role", "shared-role")).toBeNull();
  });

  it("uses an HTTP-only secure host cookie in production", () => {
    const request = new HttpRequest({ method: "GET", url: "https://example.com/api/auth/me" });
    const token = encodeSessionToken(user, "test-secret");
    const cookie = createSessionCookie(request, token);

    expect(cookie).toMatchObject({
      name: "__Host-exd8_session",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    const authenticatedRequest = new HttpRequest({
      method: "GET",
      url: "https://example.com/api/auth/me",
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    expect(getSessionUser(authenticatedRequest, "test-secret")).toEqual(user);
  });
});
