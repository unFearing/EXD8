import { app, type HttpRequest } from "@azure/functions";
import { getMechById } from "../../db/repositories/mechRepository.js";
import { fail, ok } from "../../middleware/http.js";

export async function getMechByIdHandler(request: HttpRequest) {
  try {
    const id = request.params.id;
    if (!id) {
      return fail(400, "BAD_REQUEST", "Path parameter id is required");
    }

    const doc = await getMechById(id);
    if (!doc) {
      return fail(404, "NOT_FOUND", "Mech not found");
    }

    return ok(doc);
  } catch (error: unknown) {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechGetById", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "mechs/{id:guid}",
  handler: getMechByIdHandler,
});
