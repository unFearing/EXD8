import { app, type HttpRequest } from "@azure/functions";
import { upsertQuickslot } from "../../db/repositories/matchNightRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { ok, fail } from "../../middleware/http.js";
import { quickslotUpsertInputSchema } from "../../types/contracts.js";

export async function upsertQuickslotsHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = quickslotUpsertInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const ctx = getRequestContext(request, "write");
    const saved = await upsertQuickslot(parsed.data, ctx.userName);
    return ok(saved);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("quickslotsUpsert", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "quickslots",
  handler: upsertQuickslotsHandler,
});
