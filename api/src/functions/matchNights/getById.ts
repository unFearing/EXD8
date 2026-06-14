import { app, type HttpRequest } from "@azure/functions";
import { getMatchNightById } from "../../db/repositories/matchNightRepository.js";
import { assertTeamAccess, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function getMatchNightByIdHandler(request: HttpRequest) {
  try {
    const id = request.params.id;
    if (!id) {
      return fail(400, "BAD_REQUEST", "Path parameter id is required");
    }

    const teamId = request.query.get("teamId");
    if (!teamId) {
      return fail(400, "BAD_REQUEST", "Query parameter teamId is required");
    }

    const ctx = getRequestContext(request);
    assertTeamAccess(ctx, teamId);

    const doc = await getMatchNightById(id, teamId);
    if (!doc) {
      return fail(404, "NOT_FOUND", "Match night not found");
    }

    return ok(doc);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "MISSING_AUTH_CONTEXT") {
      return fail(403, "FORBIDDEN", "Missing auth context headers");
    }
    if (error instanceof Error && error.message === "INVALID_ROLE") {
      return fail(403, "FORBIDDEN", "Invalid user role header");
    }
    if (error instanceof Error && error.message === "TEAM_MISMATCH") {
      return fail(409, "TEAM_MISMATCH", "Team partition mismatch");
    }
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("matchNightGetById", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "matchNights/{id}",
  handler: getMatchNightByIdHandler,
});
