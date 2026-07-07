import { app, type HttpRequest } from "@azure/functions";
import { createMech } from "../../db/repositories/mechRepository.js";
import { assertCanMutate, getRequestContext } from "../../middleware/authGuard.js";
import { created, fail } from "../../middleware/http.js";
import { createMechInputSchema } from "../../types/contracts.js";

export async function createMechHandler(request: HttpRequest) {
  try {
    const payload = await request.json();
    const parsed = createMechInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const ctx = getRequestContext(request);
    assertCanMutate(ctx);

    const submittedBy = request.headers.get("x-user-name") ?? ctx.userId;
    const saved = await createMech(parsed.data, submittedBy);
    return created(saved);
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
    if (error instanceof Error && error.message === "DUPLICATE_BUILD_LINK") {
      return fail(409, "WRITE_CONFLICT", "A build with this NAV-Alpha link already exists");
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
