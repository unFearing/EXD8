import { app, type HttpRequest } from "@azure/functions";
import { updateQuickslotOverviewSelection } from "../../db/repositories/matchNightRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";
import { quickslotOverviewSelectionInputSchema } from "../../types/contracts.js";

export async function updateQuickslotOverviewSelectionHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = quickslotOverviewSelectionInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const context = getRequestContext(request, "write");
    const saved = await updateQuickslotOverviewSelection(parsed.data, context.userName);
    return ok(saved);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("quickslotOverviewSelectionUpdate", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "quickslots/overview-selection",
  handler: updateQuickslotOverviewSelectionHandler,
});
