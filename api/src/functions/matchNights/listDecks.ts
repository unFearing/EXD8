import { app, type HttpRequest } from "@azure/functions";
import { listDropDecks } from "../../db/repositories/matchNightRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function listDropDecksHandler(request: HttpRequest) {
  try {
    getRequestContext(request);
    const docs = await listDropDecks();
    return ok(docs);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("dropDeckList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "decks",
  handler: listDropDecksHandler,
});
