import { app, type HttpRequest } from "@azure/functions";
import { listPresence, upsertPresence } from "../../db/repositories/presenceRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";
import { presenceUpdateInputSchema } from "../../types/contracts.js";

function presenceTeamId(requestTeamId: string): string {
  const allowHeaderTeam = process.env.NODE_ENV === "test"
    || (process.env.NODE_ENV === "development" && process.env.DISABLE_DISCORD_AUTH === "true");
  return allowHeaderTeam ? requestTeamId : (process.env.TEAM_ID ?? "EXD8");
}

export async function listPresenceHandler(request: HttpRequest) {
  try {
    const context = getRequestContext(request);
    const presence = await listPresence(presenceTeamId(context.teamId));
    return ok({ presence });
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

export async function upsertPresenceHandler(request: HttpRequest) {
  try {
    const requestContext = getRequestContext(request);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return fail(400, "BAD_REQUEST", "Invalid JSON payload");
    }
    const parsed = presenceUpdateInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const context = { ...requestContext, teamId: presenceTeamId(requestContext.teamId) };
    const presence = await upsertPresence(parsed.data, context);
    return ok(presence);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("presenceList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "presence",
  handler: listPresenceHandler,
});

app.http("presenceUpsertMe", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "presence/me",
  handler: upsertPresenceHandler,
});