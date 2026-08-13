import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { getSessionUser, resolveMappedRole, resolveSessionSigningKey } from "../functions/auth/session.js";
import { fail } from "./http.js";

const SESSION_SIGNING_KEY = resolveSessionSigningKey(
  process.env.SESSION_SIGNING_KEY || "",
  process.env.SESSION_SECRET || "",
  process.env.DISCORD_CLIENT_SECRET || "",
);
const DISCORD_ROLE_TL = process.env.DISCORD_ROLE_TL || process.env.DISCORD_TL_ROLE_ID || process.env.DISCORD_ROLE_X || "";
const DISCORD_ROLE_PILOT = process.env.DISCORD_ROLE_PILOT || process.env.DISCORD_PILOT_ROLE_ID || process.env.DISCORD_ROLE_Y || "";

export type RequestRole = "TL" | "Pilot";
export type AccessLevel = "read" | "write";

export type RequestContext = {
  teamId: string;
  role: RequestRole;
  userId: string;
  userName: string;
};

export function getRequestContext(request: HttpRequest, access: AccessLevel = "read"): RequestContext {
  const teamId = request.headers.get("x-team-id");
  const allowHeaderAuth = process.env.NODE_ENV === "test"
    || (process.env.NODE_ENV === "development" && process.env.DISABLE_DISCORD_AUTH === "true");

  if (!teamId) {
    throw new Error("MISSING_AUTH_CONTEXT");
  }

  if (!allowHeaderAuth) {
    const user = getSessionUser(request, SESSION_SIGNING_KEY);
    if (!user) throw new Error("AUTH_REQUIRED");
    const role = resolveMappedRole(user.roles, DISCORD_ROLE_TL, DISCORD_ROLE_PILOT);
    if (!role) throw new Error("INVALID_ROLE");
    const context = { teamId, role, userId: user.id, userName: user.username };
    assertAccess(context, access);
    return context;
  }

  const userId = request.headers.get("x-user-id");
  const roleHeader = request.headers.get("x-user-role");

  if (!userId || !roleHeader) {
    throw new Error("MISSING_AUTH_CONTEXT");
  }

  if (roleHeader !== "TL" && roleHeader !== "Pilot") {
    throw new Error("INVALID_ROLE");
  }

  const context: RequestContext = {
    teamId,
    role: roleHeader,
    userId,
    userName: request.headers.get("x-user-name") ?? userId,
  };
  assertAccess(context, access);
  return context;
}

function assertAccess(context: RequestContext, access: AccessLevel): void {
  if (access === "write" && context.role !== "TL") {
    throw new Error("FORBIDDEN_WRITE");
  }
}

export function authErrorResponse(error: unknown): HttpResponseInit | undefined {
  if (!(error instanceof Error)) return undefined;

  if (error.message === "AUTH_REQUIRED") {
    return fail(401, "UNAUTHORIZED", "Authentication required");
  }
  if (error.message === "MISSING_AUTH_CONTEXT") {
    return fail(403, "FORBIDDEN", "Missing auth context");
  }
  if (error.message === "INVALID_ROLE") {
    return fail(403, "FORBIDDEN", "Missing required Discord role");
  }
  if (error.message === "FORBIDDEN_WRITE") {
    return fail(403, "FORBIDDEN", "Write permission denied");
  }

  return undefined;
}

export function assertTeamAccess(ctx: RequestContext, teamId: string): void {
  if (ctx.teamId !== teamId) {
    throw new Error("TEAM_MISMATCH");
  }
}
