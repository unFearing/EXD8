import { app, type HttpRequest } from "@azure/functions";
import { findMechByBuildLink } from "../../db/repositories/mechRepository.js";
import { fail, ok } from "../../middleware/http.js";

export async function checkMechLinkHandler(request: HttpRequest) {
  try {
    const rawUrl = request.query.get("url") ?? "";
    if (!rawUrl.trim()) {
      return fail(400, "BAD_REQUEST", "Query parameter url is required");
    }

    const existing = await findMechByBuildLink(rawUrl);
    return ok({
      exists: Boolean(existing),
      mechId: existing?.id,
      chassis: existing?.chassis,
      variant: existing?.variant,
    });
  } catch {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechCheckLink", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "mechs/checkLink",
  handler: checkMechLinkHandler,
});
