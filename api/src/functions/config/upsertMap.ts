import { app, type HttpRequest } from "@azure/functions";
import { upsertMapConfig } from "../../db/repositories/configRepository.js";
import { assertCanWrite, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";
import { mapConfigUpsertInputSchema } from "../../types/contracts.js";

export async function upsertMapConfigHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = mapConfigUpsertInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const ctx = getRequestContext(request);
    assertCanWrite(ctx);

    const saved = await upsertMapConfig(parsed.data);
    return ok(saved);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "MISSING_AUTH_CONTEXT") {
      return fail(403, "FORBIDDEN", "Missing auth context headers");
    }
    if (error instanceof Error && error.message === "INVALID_ROLE") {
      return fail(403, "FORBIDDEN", "Invalid user role header");
    }
    if (error instanceof Error && error.message === "FORBIDDEN_WRITE") {
      return fail(403, "FORBIDDEN", "Write permission denied");
    }

    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("configMapUpsert", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "config/maps",
  handler: upsertMapConfigHandler,
});
