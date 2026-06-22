import { app, type HttpRequest } from "@azure/functions";
import { getMechHierarchy } from "../../db/repositories/mechRepository.js";
import { fail, ok } from "../../middleware/http.js";

export async function getMechHierarchyHandler(_request?: HttpRequest) {
  try {
    const hierarchy = await getMechHierarchy();
    return ok(hierarchy);
  } catch (error: unknown) {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechHierarchy", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "mechs/hierarchy",
  handler: getMechHierarchyHandler,
});
