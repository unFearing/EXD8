import type { MatchNightCreateInput, MatchNightDoc } from "../../types/contracts.js";
import { getMatchNightsContainer } from "../cosmos.js";

export async function createMatchNight(input: MatchNightCreateInput, updatedBy: string): Promise<MatchNightDoc> {
  const now = new Date().toISOString();
  const id = `match-${input.date}-${Math.random().toString(16).slice(2, 8)}`;
  const comp = `${input.teamId}:${input.seasonId}`;
  const doc: MatchNightDoc = {
    ...input,
    id,
    comp,
    updatedAt: now,
    updatedBy,
    schemaVersion: "1.0.0",
    docType: "matchNight",
  };

  const container = getMatchNightsContainer();
  await container.items.upsert(doc);
  return doc;
}

export async function getMatchNightById(id: string, teamId: string): Promise<MatchNightDoc | null> {
  const container = getMatchNightsContainer();
  const { resources } = await container.items
    .query<MatchNightDoc>({
      query: "SELECT * FROM c WHERE c.docType = @docType AND c.id = @id AND c.teamId = @teamId",
      parameters: [
        { name: "@docType", value: "matchNight" },
        { name: "@id", value: id },
        { name: "@teamId", value: teamId },
      ],
    })
    .fetchAll();

  return resources[0] ?? null;
}
