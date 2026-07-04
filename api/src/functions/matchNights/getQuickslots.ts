import { app, type HttpRequest } from "@azure/functions";
import { getQuickslotById } from "../../db/repositories/matchNightRepository.js";
import { ok, fail } from "../../middleware/http.js";

const DEFAULT_QUICKSLOT_ID = "quickslots-default";

export async function getQuickslotsHandler(request: HttpRequest) {
  try {
    const id = request.query.get("id") ?? DEFAULT_QUICKSLOT_ID;
    const doc = await getQuickslotById(id);
    return ok(doc ?? { id, slots: [], updatedAt: new Date().toISOString(), updatedBy: "system", schemaVersion: "1.0.0", docType: "quickslot" });
  } catch {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("quickslotsGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "quickslots",
  handler: getQuickslotsHandler,
});
