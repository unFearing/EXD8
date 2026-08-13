import { app, type HttpRequest } from "@azure/functions";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";
import { MECH_ROLE_VALUES } from "../../types/mechRoles.js";

export async function listMechRolesHandler(request: HttpRequest) {
  try {
    getRequestContext(request);
    return ok([...MECH_ROLE_VALUES]);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("configMechRoleList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "config/mech-roles",
  handler: listMechRolesHandler,
});
