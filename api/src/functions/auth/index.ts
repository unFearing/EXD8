import { app, type HttpRequest } from "@azure/functions";
import { ok, fail } from "../../middleware/http.js";
import {
  createExpiredSessionCookies,
  createSessionCookie,
  encodeSessionToken,
  getSessionUser,
  resolveMappedRole,
  resolveSessionSigningKey,
  type SessionAppRole,
  type SessionUser,
} from "./session.js";

const DISCORD_TOKEN_ENDPOINT = "https://discord.com/api/v10/oauth2/token";
const DISCORD_API_ENDPOINT = "https://discord.com/api/v10";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const DISCORD_ROLE_TL = process.env.DISCORD_ROLE_TL || process.env.DISCORD_TL_ROLE_ID || process.env.DISCORD_ROLE_X || "";
const DISCORD_ROLE_PILOT = process.env.DISCORD_ROLE_PILOT || process.env.DISCORD_PILOT_ROLE_ID || process.env.DISCORD_ROLE_Y || "";
const SESSION_SIGNING_KEY = resolveSessionSigningKey(
  process.env.SESSION_SIGNING_KEY || "",
  process.env.SESSION_SECRET || "",
  DISCORD_CLIENT_SECRET,
);

type AppRole = SessionAppRole;

type DiscordUser = SessionUser;

function resolveAppRole(roles: string[]): AppRole | null {
  return resolveMappedRole(roles, DISCORD_ROLE_TL, DISCORD_ROLE_PILOT);
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

export async function discordOAuthHandler(request: HttpRequest) {
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

    const token = encodeSessionToken(user, SESSION_SIGNING_KEY);

    return {
      ...ok({ user }),
      cookies: [createSessionCookie(request, token)],
    };
  } catch (err) {
    console.error("Discord OAuth error:", err);
    return fail(500, "INTERNAL", err instanceof Error ? err.message : "OAuth exchange failed");
  }
}

app.http("discordOAuth", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/discord",
  handler: discordOAuthHandler,
});

export async function authMeHandler(request: HttpRequest) {
  try {
    const user = getSessionUser(request, SESSION_SIGNING_KEY);

    if (!user) {
      return fail(401, "UNAUTHORIZED", "Invalid or expired session");
    }

    const appRole = resolveAppRole(user.roles);
    if (!appRole) {
      return fail(403, "FORBIDDEN", "Access denied: missing required Discord role");
    }

    return ok({ ...user, appRole });
  } catch (err) {
    console.error("Auth check error:", err);
    return fail(500, "INTERNAL", "Auth check failed");
  }
}

app.http("authMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: authMeHandler,
});

export async function authLogoutHandler() {
  return {
    ...ok({ loggedOut: true }),
    cookies: createExpiredSessionCookies(),
  };
}

app.http("authLogout", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/logout",
  handler: authLogoutHandler,
});

export async function authConfigHandler() {
  return ok({ clientId: DISCORD_CLIENT_ID });
}

app.http("authConfig", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/config",
  handler: authConfigHandler,
});
