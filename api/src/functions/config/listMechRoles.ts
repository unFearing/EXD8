import { app } from "@azure/functions";
import { ok } from "../../middleware/http.js";
import { MECH_ROLE_VALUES } from "../../types/mechRoles.js";

export async function listMechRolesHandler() {
  return ok([...MECH_ROLE_VALUES]);
}

app.http("configMechRoleList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "config/mech-roles",
  handler: listMechRolesHandler,
});
