import type { MatchNightCreateInput, MatchNightDoc } from "../../types/contracts.js";
import { getMatchNightsContainer } from "../cosmos.js";

export async function createMatchNight(input: MatchNightCreateInput, updatedBy: string): Promise<MatchNightDoc> {
  const now = new Date().toISOString();
  const id = `match-${input.date}-${Math.random().toString(16).slice(2, 8)}`;
  const doc: MatchNightDoc = {
    ...input,
    id,
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
  try {
    const { resource } = await container.item(id, teamId).read<MatchNightDoc>();
    return resource ?? null;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 404) {
      return null;
    }
    throw error;
  }
}
