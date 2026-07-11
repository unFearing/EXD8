import { app, type HttpRequest } from "@azure/functions";
import { deleteMechById, getMechById } from "../../db/repositories/mechRepository.js";
import { assertCanWrite, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

const APP_ROLE_TEAM_LEAD = "TL";

function normalizeUserName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export async function deleteMechHandler(request: HttpRequest) {
  try {
    const id = request.params.id;
    if (!id) {
      return fail(400, "BAD_REQUEST", "Path parameter id is required");
    }

    const ctx = getRequestContext(request);
    const mech = await getMechById(id);
    if (!mech) {
      return fail(404, "NOT_FOUND", "Mech not found");
    }

    if (ctx.role !== APP_ROLE_TEAM_LEAD) {
      const requestUser = normalizeUserName(request.headers.get("x-user-name") ?? ctx.userId);
      const owner = normalizeUserName(mech.submittedBy);
      if (!requestUser || !owner || requestUser !== owner) {
        return fail(403, "FORBIDDEN", "Write permission denied");
      }
    } else {
      assertCanWrite(ctx);
    }

    const deleted = await deleteMechById(id);
    if (!deleted) {
      return fail(404, "NOT_FOUND", "Mech not found");
    }

    return ok({ id, deleted: true });
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

app.http("mechDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "mechs/{id:guid}",
  handler: deleteMechHandler,
});
