import { app, type HttpRequest } from "@azure/functions";
import { deleteMechById } from "../../db/repositories/mechRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function deleteMechHandler(request: HttpRequest) {
  try {
    const id = request.params.id;
    if (!id) {
      return fail(400, "BAD_REQUEST", "Path parameter id is required");
    }

    getRequestContext(request, "write");

    const deleted = await deleteMechById(id);
    if (!deleted) {
      return fail(404, "NOT_FOUND", "Mech not found");
    }

    return ok({ id, deleted: true });
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "mechs/{id:guid}",
  handler: deleteMechHandler,
});
