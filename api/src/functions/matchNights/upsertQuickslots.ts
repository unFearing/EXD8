import { app, type HttpRequest } from "@azure/functions";
import { upsertQuickslot } from "../../db/repositories/matchNightRepository.js";
import { ok, fail } from "../../middleware/http.js";
import { quickslotUpsertInputSchema } from "../../types/contracts.js";

export async function upsertQuickslotsHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = quickslotUpsertInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const updatedBy = request.headers.get("x-user-id") ?? "deckboard-ui";
    const saved = await upsertQuickslot(parsed.data, updatedBy);
    return ok(saved);
  } catch {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("quickslotsUpsert", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "quickslots",
  handler: upsertQuickslotsHandler,
});
