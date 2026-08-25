import { app, type HttpRequest } from "@azure/functions";
import { upsertDropDeck } from "../../db/repositories/matchNightRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";
import { dropDeckUpsertInputSchema } from "../../types/contracts.js";

export async function upsertDropDeckHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = dropDeckUpsertInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const ctx = getRequestContext(request, "contribute");
    const saved = await upsertDropDeck(parsed.data, ctx.userName);
    return ok(saved);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof Error && error.message === "MIN_FILLED_SLOTS") {
      return fail(400, "BAD_REQUEST", "Deck must have at least 5 filled slots before saving");
    }
    if (error instanceof Error && error.message === "MISSING_BASE_CONTEXT") {
      return fail(400, "BAD_REQUEST", "Missing base context for deck update");
    }
    if (error instanceof Error && error.message === "WRITE_CONFLICT") {
      const details = (error as Error & { details?: unknown }).details;
      return fail(409, "WRITE_CONFLICT", "Deck was updated by another user", details);
    }
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("dropDeckUpsert", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "decks",
  handler: upsertDropDeckHandler,
});
