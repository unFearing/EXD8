import { app, type HttpRequest } from "@azure/functions";
import { listDropDecks } from "../../db/repositories/matchNightRepository.js";
import { fail, ok } from "../../middleware/http.js";

export async function listDropDecksHandler(_request?: HttpRequest) {
  try {
    const docs = await listDropDecks();
    return ok(docs);
  } catch (error: unknown) {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("dropDeckList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "decks",
  handler: listDropDecksHandler,
});
