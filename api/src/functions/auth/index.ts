import { app } from "@azure/functions";
import { ok, fail } from "../../middleware/http.js";

const DISCORD_TOKEN_ENDPOINT = "https://discord.com/api/v10/oauth2/token";
const DISCORD_API_ENDPOINT = "https://discord.com/api/v10";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const DISCORD_ROLE_TL = process.env.DISCORD_ROLE_TL || process.env.DISCORD_ROLE_X || "";
const DISCORD_ROLE_PILOT = process.env.DISCORD_ROLE_PILOT || process.env.DISCORD_ROLE_Y || "";

type AppRole = "TL" | "Pilot";

interface DiscordUser {
  id: string;
  username: string;
  avatar?: string;
  roles: string[];
  appRole: AppRole;
}

function resolveAppRole(roles: string[]): AppRole | null {
  if (DISCORD_ROLE_TL && roles.includes(DISCORD_ROLE_TL)) {
    return "TL";
  }
  if (DISCORD_ROLE_PILOT && roles.includes(DISCORD_ROLE_PILOT)) {
    return "Pilot";
  }
  return null;
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ access_token: string }> {
  const response = await fetch(DISCORD_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Discord token exchange failed: ${detail}`);
  }

  return response.json();
}

async function fetchDiscordUser(accessToken: string): Promise<{ id: string; username: string; avatar?: string }> {
  const response = await fetch(`${DISCORD_API_ENDPOINT}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Discord user");
  }

  return response.json();
}

async function fetchUserRoles(accessToken: string): Promise<string[]> {
  if (!DISCORD_GUILD_ID) {
    return [];
  }

  try {
    const response = await fetch(`${DISCORD_API_ENDPOINT}/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return [];
    }

    const member = await response.json();
    return member.roles || [];
  } catch {
    return [];
  }
}

function encodeToken(user: DiscordUser): string {
  // Simple base64 token (in production, use JWT)
  return Buffer.from(JSON.stringify(user)).toString("base64");
}

function decodeToken(token: string): DiscordUser | null {
  try {
    return JSON.parse(Buffer.from(token, "base64").toString());
  } catch {
    return null;
  }
}

app.http("discordOAuth", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/discord",
  handler: async (request) => {
    try {
      const body = await request.json() as Record<string, unknown>;
      const code = body.code as string;
      const redirectUriRaw = typeof body.redirectUri === "string" ? body.redirectUri : "";

      if (!code) {
        return fail(400, "BAD_REQUEST", "Missing authorization code");
      }

      if (!redirectUriRaw) {
        return fail(400, "BAD_REQUEST", "Missing redirectUri - client must send exact redirect URI for Discord token exchange");
      }

      let redirectUri: string;
      try {
        const parsed = new URL(redirectUriRaw);
        redirectUri = parsed.toString();
      } catch {
        return fail(400, "BAD_REQUEST", "Invalid redirectUri format");
      }

      const { access_token } = await exchangeCodeForToken(code, redirectUri);
      const userInfo = await fetchDiscordUser(access_token);
      const roles = await fetchUserRoles(access_token);
      const appRole = resolveAppRole(roles);

      if (!appRole) {
        return fail(403, "FORBIDDEN", "Access denied: missing required Discord role");
      }

      const user: DiscordUser = {
        id: userInfo.id,
        username: userInfo.username,
        avatar: userInfo.avatar,
        roles,
        appRole,
      };

      const token = encodeToken(user);

      return ok({ token, user });
    } catch (err) {
      console.error("Discord OAuth error:", err);
      return fail(500, "INTERNAL", err instanceof Error ? err.message : "OAuth exchange failed");
    }
  },
});

app.http("authMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: async (request) => {
    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return fail(400, "BAD_REQUEST", "Missing authorization header");
      }

      const token = authHeader.slice(7);
      const user = decodeToken(token);

      if (!user) {
        return fail(400, "BAD_REQUEST", "Invalid token");
      }

      return ok(user);
    } catch (err) {
      console.error("Auth check error:", err);
      return fail(500, "INTERNAL", "Auth check failed");
    }
  },
});

app.http("authConfig", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/config",
  handler: async () => {
    return ok({ clientId: DISCORD_CLIENT_ID });
  },
});
