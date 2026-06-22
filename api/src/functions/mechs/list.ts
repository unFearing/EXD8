import { app, type HttpRequest } from "@azure/functions";
import { listMechs } from "../../db/repositories/mechRepository.js";
import { fail, ok } from "../../middleware/http.js";

export async function listMechsHandler(_request?: HttpRequest) {
  try {
    const docs = await listMechs();
    return ok(docs);
  } catch (error: unknown) {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "mechs",
  handler: listMechsHandler,
});
