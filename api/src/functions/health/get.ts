import { app } from "@azure/functions";
import { ok } from "../../middleware/http.js";

app.http("healthGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => ok({ status: "healthy", timestamp: new Date().toISOString() }),
});
