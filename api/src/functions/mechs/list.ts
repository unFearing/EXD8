import { app, type HttpRequest } from "@azure/functions";
import { listMechs } from "../../db/repositories/mechRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function listMechsHandler(request: HttpRequest) {
  try {
    getRequestContext(request);
    const docs = await listMechs();
    return ok(docs);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "mechs",
  handler: listMechsHandler,
});
