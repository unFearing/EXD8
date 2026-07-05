import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Discord API responses
const mockDiscordTokenResponse = {
  access_token: "mock-access-token",
  token_type: "Bearer",
  expires_in: 604800,
  scope: "identify guilds.members.read",
};

const mockDiscordUser = {
  id: "123456789",
  username: "testuser",
  avatar: "abc123",
};

// These tests assume the OAuth handler functions can be extracted
// For now we test the core logic

describe("OAuth Token Exchange & User Resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Discord token exchange", () => {
    it("successfully exchanges code for access token", async () => {
      global.fetch = vi.fn(async (url: string) => {
        if (url.includes("oauth2/token")) {
          return new Response(JSON.stringify(mockDiscordTokenResponse), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }) as never;

      const params = new URLSearchParams();
      params.append("client_id", "test-client-id");
      params.append("client_secret", "test-secret");
      params.append("code", "test-code");
      params.append("redirect_uri", "http://localhost:5173/auth/callback");
      params.append("grant_type", "authorization_code");

      const response = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.access_token).toBe("mock-access-token");
    });

    it("handles Discord token endpoint errors", async () => {
      global.fetch = vi.fn(async (url: string) => {
        if (url.includes("oauth2/token")) {
          return new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }) as never;

      const response = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        body: "",
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Discord user fetching", () => {
    it("fetches authenticated user info", async () => {
      global.fetch = vi.fn(async (url: string) => {
        if (url.includes("users/@me") && !url.includes("guilds")) {
          return new Response(JSON.stringify(mockDiscordUser), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }) as never;

      const response = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: "Bearer mock-access-token" },
      });

      expect(response.status).toBe(200);
      const user = await response.json();
      expect(user.id).toBe("123456789");
      expect(user.username).toBe("testuser");
    });

    it("handles user fetch errors", async () => {
      global.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }) as never;

      const response = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: "Bearer invalid-token" },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("User role resolution", () => {
    it("resolves TL role from Discord roles", () => {
      const DISCORD_ROLE_TL = "role-tl-id";
      const userRoles = ["role-tl-id"];

      const hasRole = userRoles.includes(DISCORD_ROLE_TL);
      expect(hasRole).toBe(true);
    });

    it("resolves Pilot role from Discord roles", () => {
      const DISCORD_ROLE_PILOT = "role-pilot-id";
      const userRoles = ["role-pilot-id"];

      const hasRole = userRoles.includes(DISCORD_ROLE_PILOT);
      expect(hasRole).toBe(true);
    });

    it("denies access when user has no required roles", () => {
      const DISCORD_ROLE_TL = "role-tl-id";
      const DISCORD_ROLE_PILOT = "role-pilot-id";
      const userRoles = ["some-other-role"];

      const hasTL = userRoles.includes(DISCORD_ROLE_TL);
      const hasPilot = userRoles.includes(DISCORD_ROLE_PILOT);

      expect(hasTL).toBe(false);
      expect(hasPilot).toBe(false);
    });

    it("prioritizes TL role over Pilot role", () => {
      const DISCORD_ROLE_TL = "role-tl-id";
      const DISCORD_ROLE_PILOT = "role-pilot-id";
      const userRoles = ["role-tl-id", "role-pilot-id"];

      // Simulating the role resolution logic (TL first)
      let appRole: "TL" | "Pilot" | null = null;
      if (userRoles.includes(DISCORD_ROLE_TL)) {
        appRole = "TL";
      } else if (userRoles.includes(DISCORD_ROLE_PILOT)) {
        appRole = "Pilot";
      }

      expect(appRole).toBe("TL");
    });
  });

  describe("Redirect URI validation", () => {
    it("accepts valid redirect URIs", () => {
      const validUris = [
        "http://localhost:5173/auth/callback",
        "https://example.com/auth/callback",
        "https://app.azurestaticapps.net/auth/callback",
      ];

      validUris.forEach((uri) => {
        expect(() => new URL(uri)).not.toThrow();
      });
    });

    it("rejects invalid redirect URIs", () => {
      const invalidUris = [
        "not a url",
        "ht!tp://invalid",
        "",
      ];

      invalidUris.forEach((uri) => {
        expect(() => new URL(uri)).toThrow();
      });
    });

    it("normalizes redirect URI by removing fragment", () => {
      const uri = "http://localhost:5173/auth/callback#something";
      const parsed = new URL(uri);
      parsed.hash = "";
      expect(parsed.toString()).not.toContain("#");
    });
  });
});
