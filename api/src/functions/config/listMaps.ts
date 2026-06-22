import { app } from "@azure/functions";
import { listMapConfigs } from "../../db/repositories/configRepository.js";
import { fail, ok } from "../../middleware/http.js";

export async function listMapConfigsHandler() {
  try {
    const docs = await listMapConfigs();
    return ok(docs);
  } catch {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("configMapList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "config/maps",
  handler: listMapConfigsHandler,
});
