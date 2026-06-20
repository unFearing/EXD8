import { app, type HttpRequest } from "@azure/functions";
import { listMechs } from "../../db/repositories/mechRepository.js";
import { getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function listMechsHandler(request: HttpRequest) {
  try {
    getRequestContext(request);
    const docs = await listMechs();
    return ok(docs);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "MISSING_AUTH_CONTEXT") {
      return fail(403, "FORBIDDEN", "Missing auth context headers");
    }
    if (error instanceof Error && error.message === "INVALID_ROLE") {
      return fail(403, "FORBIDDEN", "Invalid user role header");
    }
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "mechs",
  handler: listMechsHandler,
});