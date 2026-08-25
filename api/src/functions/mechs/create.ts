import { app, type HttpRequest } from "@azure/functions";
import { createMech } from "../../db/repositories/mechRepository.js";
import { authErrorResponse, getRequestContext } from "../../middleware/authGuard.js";
import { created, fail } from "../../middleware/http.js";
import { createMechInputSchema } from "../../types/contracts.js";

export async function createMechHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = createMechInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const ctx = getRequestContext(request, "contribute");

    const saved = await createMech(parsed.data, ctx.userName);
    return created(saved);
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof Error && error.message === "DUPLICATE_BUILD_LINK") {
      return fail(409, "WRITE_CONFLICT", "A build with this NAV-Alpha link already exists");
    }
    if (error instanceof Error && error.message === "CONFIG_MECH_NOT_FOUND") {
      return fail(400, "BAD_REQUEST", "Mech chassis/variant not found in mechs_config.json");
    }
    if (error instanceof Error && error.message === "CONFIG_MECH_AMBIGUOUS") {
      return fail(400, "BAD_REQUEST", "Mech chassis/variant is ambiguous in mechs_config.json");
    }
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "mechs",
  handler: createMechHandler,
});
