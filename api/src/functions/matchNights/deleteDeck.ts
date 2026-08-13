import { app, type HttpRequest } from "@azure/functions";
import { deleteDropDeckById } from "../../db/repositories/matchNightRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function deleteDropDeckHandler(request: HttpRequest) {
  try {
    const id = request.params.id;
    if (!id) {
      return fail(400, "BAD_REQUEST", "Path parameter id is required");
    }

    getRequestContext(request, "write");

    const deleted = await deleteDropDeckById(id);
    if (!deleted) {
      return fail(404, "NOT_FOUND", "Drop deck not found");
    }

    return ok({ id, deleted: true });
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("dropDeckDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "decks/{id}",
  handler: deleteDropDeckHandler,
});
