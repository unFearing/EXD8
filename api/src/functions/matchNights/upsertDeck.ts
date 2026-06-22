import { app, type HttpRequest } from "@azure/functions";
import { upsertDropDeck } from "../../db/repositories/matchNightRepository.js";
import { fail, ok } from "../../middleware/http.js";
import { dropDeckUpsertInputSchema } from "../../types/contracts.js";

export async function upsertDropDeckHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = dropDeckUpsertInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const updatedBy = request.headers.get("x-user-id") ?? "deckboard-ui";
    const saved = await upsertDropDeck(parsed.data, updatedBy);
    return ok(saved);
  } catch (error: unknown) {
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
