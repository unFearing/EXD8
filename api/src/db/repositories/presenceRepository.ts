import { getMatchNightsContainer } from "../cosmos.js";
import { presenceDocSchema, type PresenceDoc, type PresenceUpdateInput } from "../../types/contracts.js";
import type { RequestContext } from "../../middleware/authGuard.js";

export const PRESENCE_EXPIRY_MS = 90_000;
const PRESENCE_TTL_SECONDS = Math.ceil(PRESENCE_EXPIRY_MS / 1000);

function presenceComp(teamId: string): string {
  return `presence:${teamId}`;
}

export async function upsertPresence(
  input: PresenceUpdateInput,
  context: RequestContext,
  now = new Date(),
): Promise<PresenceDoc> {
  const doc: PresenceDoc = {
    ...input,
    id: `presence:${context.userId}`,
    comp: presenceComp(context.teamId),
    teamId: context.teamId,
    userId: context.userId,
    userName: context.userName,
    role: context.role,
    avatar: context.avatar,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PRESENCE_EXPIRY_MS).toISOString(),
    ttl: PRESENCE_TTL_SECONDS,
    schemaVersion: "1.0.0",
    docType: "presence",
  };

  await getMatchNightsContainer().items.upsert(doc);
  return doc;
}

export async function listPresence(teamId: string, now = new Date()): Promise<PresenceDoc[]> {
  const { resources } = await getMatchNightsContainer().items
    .query<PresenceDoc>({
      query: "SELECT * FROM c WHERE c.docType = @docType AND c.comp = @comp AND c.expiresAt > @now ORDER BY c.updatedAt DESC",
      parameters: [
        { name: "@docType", value: "presence" },
        { name: "@comp", value: presenceComp(teamId) },
        { name: "@now", value: now.toISOString() },
      ],
    })
    .fetchAll();

  return resources.flatMap((entry) => {
    const parsed = presenceDocSchema.safeParse(entry);
    if (!parsed.success || parsed.data.expiresAt <= now.toISOString()) return [];
    const { _rid, _self, _etag, _attachments, _ts, ...presence } = parsed.data;
    return [presence];
  });
}