import { app, type HttpRequest } from "@azure/functions";
import { listMapConfigs } from "../../db/repositories/configRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

export async function listMapConfigsHandler(request: HttpRequest) {
  try {
    getRequestContext(request);
    const docs = await listMapConfigs();
    return ok(docs);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("configMapList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "config/maps",
  handler: listMapConfigsHandler,
});
