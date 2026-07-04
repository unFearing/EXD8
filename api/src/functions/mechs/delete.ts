import { app, type HttpRequest } from "@azure/functions";
import { deleteMechById } from "../../db/repositories/mechRepository.js";
import { assertCanWrite, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function deleteMechHandler(request: HttpRequest) {
  try {
    const id = request.params.id;
    if (!id) {
      return fail(400, "BAD_REQUEST", "Path parameter id is required");
    }

    const ctx = getRequestContext(request);
    assertCanWrite(ctx);

    const deleted = await deleteMechById(id);
    if (!deleted) {
      return fail(404, "NOT_FOUND", "Mech not found");
    }

    return ok({ id, deleted: true });
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

    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "mechs/{id:guid}",
  handler: deleteMechHandler,
});
