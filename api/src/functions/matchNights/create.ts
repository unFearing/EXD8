import { app, type HttpRequest } from "@azure/functions";
import { createMatchNight } from "../../db/repositories/matchNightRepository.js";
import { assertCanWrite, assertTeamAccess, getRequestContext } from "../../middleware/authGuard.js";
import { created, fail } from "../../middleware/http.js";
import { matchNightCreateInputSchema } from "../../types/contracts.js";

export async function createMatchNightHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = matchNightCreateInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const ctx = getRequestContext(request);
    assertCanWrite(ctx);
    assertTeamAccess(ctx, parsed.data.teamId);

    const saved = await createMatchNight(parsed.data, ctx.userId);
    return created(saved);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "MISSING_AUTH_CONTEXT") {
      return fail(403, "FORBIDDEN", "Missing auth context headers");
    }
    if (error instanceof Error && error.message === "INVALID_ROLE") {
      return fail(403, "FORBIDDEN", "Invalid user role header");
    }
    if (error instanceof Error && error.message === "FORBIDDEN_WRITE") {
      return fail(403, "FORBIDDEN", "Write permission denied");
    }
    if (error instanceof Error && error.message === "TEAM_MISMATCH") {
      return fail(409, "TEAM_MISMATCH", "Team partition mismatch");
    }
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("matchNightCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "matchNights",
  handler: createMatchNightHandler,
});
