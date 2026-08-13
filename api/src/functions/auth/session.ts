import { createHmac, timingSafeEqual } from "node:crypto";
import type { Cookie, HttpRequest } from "@azure/functions";

export type SessionAppRole = "TL" | "Pilot";

export type SessionUser = {
  id: string;
  username: string;
  avatar?: string;
  roles: string[];
  appRole: SessionAppRole;
};

type SessionPayload = {
  user: SessionUser;
  expiresAt: number;
};

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = "__Host-exd8_session";
const LOCAL_SESSION_COOKIE_NAME = "exd8_session";
const SESSION_KEY_CONTEXT = "exd8/session-signing/v1";

export function resolveSessionSigningKey(signingKey: string, legacySecret: string, discordClientSecret: string): string {
  const dedicatedKey = signingKey.trim() || legacySecret.trim();
  if (dedicatedKey) return dedicatedKey;

  const oauthSecret = discordClientSecret.trim();
  if (!oauthSecret) return "";
  return createHmac("sha256", oauthSecret).update(SESSION_KEY_CONTEXT).digest("base64url");
}

export function resolveMappedRole(
  roles: string[],
  teamLeadRoleId: string,
  pilotRoleId: string,
): SessionAppRole | null {
  if (teamLeadRoleId && teamLeadRoleId === pilotRoleId) return null;
  if (teamLeadRoleId && roles.includes(teamLeadRoleId)) return "TL";
  if (pilotRoleId && roles.includes(pilotRoleId)) return "Pilot";
  return null;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeSessionToken(
  user: SessionUser,
  secret: string,
  now = Date.now(),
): string {
  if (!secret) throw new Error("SESSION_SIGNING_KEY is not configured");
  const payload = Buffer.from(JSON.stringify({ user, expiresAt: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${signPayload(payload, secret)}`;
}

export function decodeSessionToken(token: string, secret: string, now = Date.now()): SessionUser | null {
  if (!secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expectedSignature = signPayload(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed?.user?.id || !parsed.user.username || !Array.isArray(parsed.user.roles)) return null;
    if (parsed.user.appRole !== "TL" && parsed.user.appRole !== "Pilot") return null;
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= now) return null;
    return parsed.user;
  } catch {
    return null;
  }
}

function isSecureRequest(request: HttpRequest): boolean {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol) return forwardedProtocol === "https";
  return new URL(request.url).protocol === "https:";
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const segment of header?.split(";") ?? []) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    cookies.set(segment.slice(0, separator).trim(), segment.slice(separator + 1).trim());
  }
  return cookies;
}

export function getSessionUser(request: HttpRequest, secret: string): SessionUser | null {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.get(SESSION_COOKIE_NAME) ?? cookies.get(LOCAL_SESSION_COOKIE_NAME);
  return token ? decodeSessionToken(token, secret) : null;
}

export function createSessionCookie(request: HttpRequest, token: string): Cookie {
  const secure = isSecureRequest(request);
  return {
    name: secure ? SESSION_COOKIE_NAME : LOCAL_SESSION_COOKIE_NAME,
    value: token,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    httpOnly: true,
    secure,
    sameSite: "Lax",
  };
}

export function createExpiredSessionCookies(): Cookie[] {
  return [SESSION_COOKIE_NAME, LOCAL_SESSION_COOKIE_NAME].map((name) => ({
    name,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: name === SESSION_COOKIE_NAME,
    sameSite: "Lax",
  }));
}
