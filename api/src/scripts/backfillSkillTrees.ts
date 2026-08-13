import "./loadLocalEnv.js";
import { getMechsContainer } from "../db/cosmos.js";
import { normalizeSkillTreeFields, parseSkillTreeUrl, type SkillTreeTech } from "../utils/skillTree.js";

type CosmosDoc = Record<string, unknown> & {
  id: string;
  tech?: SkillTreeTech;
  skillCode?: string;
  skillTreeCode?: string;
  skillTreeUrl?: string;
};

function removeSystemFields(doc: CosmosDoc): Record<string, unknown> {
  const { _rid, _self, _etag, _attachments, _ts, ...rest } = doc;
  return rest;
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");
  const container = getMechsContainer();
  const { resources } = await container.items
    .query<CosmosDoc>({ query: "SELECT * FROM c WHERE IS_DEFINED(c.chassis) AND IS_DEFINED(c.variant)" })
    .fetchAll();

  let matched = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of resources) {
    if (doc.tech !== "IS" && doc.tech !== "Clan") {
      skipped += 1;
      continue;
    }

    const normalized = normalizeSkillTreeFields(doc);
    if (!normalized.skillTreeCode || !normalized.skillTreeUrl || !parseSkillTreeUrl(normalized.skillTreeUrl)) {
      skipped += 1;
      continue;
    }

    if (doc.skillTreeCode === normalized.skillTreeCode && doc.skillTreeUrl === normalized.skillTreeUrl) {
      continue;
    }

    matched += 1;
    console.log(`${apply ? "APPLY" : "DRY-RUN"} id=${doc.id} tech=${doc.tech} skillTreeCode=${normalized.skillTreeCode}`);
    if (!apply) continue;

    try {
      await container.items.upsert({ ...removeSystemFields(doc), ...normalized });
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`FAILED id=${doc.id}`, error);
    }
  }

  console.log(`Scanned=${resources.length} Matched=${matched} Updated=${updated} Skipped=${skipped} Failed=${failed} Apply=${apply}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});