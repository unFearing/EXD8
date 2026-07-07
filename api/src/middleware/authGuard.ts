import type { HttpRequest } from "@azure/functions";

export type RequestRole = "TL" | "Pilot";

export type RequestContext = {
  teamId: string;
  role: RequestRole;
  userId: string;
};

export function getRequestContext(request: HttpRequest): RequestContext {
  const teamId = request.headers.get("x-team-id");
  const userId = request.headers.get("x-user-id");
  const roleHeader = request.headers.get("x-user-role");

  if (!teamId || !userId || !roleHeader) {
    throw new Error("MISSING_AUTH_CONTEXT");
  }

  if (roleHeader !== "TL" && roleHeader !== "Pilot") {
    throw new Error("INVALID_ROLE");
  }

  return {
    teamId,
    role: roleHeader,
    userId,
  };
}

export function assertCanWrite(ctx: RequestContext): void {
  if (ctx.role !== "TL") {
    throw new Error("FORBIDDEN_WRITE");
  }
}

export function assertCanMutate(ctx: RequestContext): void {
  if (ctx.role !== "TL" && ctx.role !== "Pilot") {
    throw new Error("FORBIDDEN_WRITE");
  }
}

export function assertTeamAccess(ctx: RequestContext, teamId: string): void {
  if (ctx.teamId !== teamId) {
    throw new Error("TEAM_MISMATCH");
  }
}
