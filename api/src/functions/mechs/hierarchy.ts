import { app, type HttpRequest } from "@azure/functions";
import { getMechHierarchy } from "../../db/repositories/mechRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function getMechHierarchyHandler(request: HttpRequest) {
  try {
    getRequestContext(request);
    const hierarchy = await getMechHierarchy();
    return ok(hierarchy);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechHierarchy", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "mechs/hierarchy",
  handler: getMechHierarchyHandler,
});
