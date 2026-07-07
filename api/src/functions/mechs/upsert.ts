import { app, type HttpRequest } from "@azure/functions";
import { upsertMechWithId } from "../../db/repositories/mechRepository.js";
import { assertCanMutate, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";
import { upsertMechInputSchema } from "../../types/contracts.js";

export async function upsertMechHandler(request: HttpRequest) {
  try {
    const id = request.params.id;
    if (!id) {
      return fail(400, "BAD_REQUEST", "Path parameter id is required");
    }

    const payload = await request.json();
    const parsed = upsertMechInputSchema.safeParse({
      ...(payload as object),
      id,
    });
    if (!parsed.success) {
      return fail(400, "BAD_REQUEST", "Invalid payload", parsed.error.flatten());
    }

    const ctx = getRequestContext(request);
    assertCanMutate(ctx);

    const submittedBy = request.headers.get("x-user-name") ?? ctx.userId;
    const saved = await upsertMechWithId(id, parsed.data, submittedBy);
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
    if (error instanceof Error && error.message === "INVALID_ID") {
      return fail(400, "BAD_REQUEST", "Mech id must be a valid GUID");
    }
    if (error instanceof Error && error.message === "DUPLICATE_BUILD_LINK") {
      return fail(409, "WRITE_CONFLICT", "A build with this NAV-Alpha link already exists");
    }
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechUpsert", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "mechs/{id:guid}",
  handler: upsertMechHandler,
});
