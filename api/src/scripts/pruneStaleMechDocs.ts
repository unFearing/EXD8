import "./loadLocalEnv.js";
import { getMechsContainer } from "../db/cosmos.js";

type MechRawDoc = {
  id: string;
  _ts?: number;
  _etag?: string;
  docType?: string;
  class?: string;
  tech?: string;
  chassis?: string;
  variant?: string;
};

type Args = {
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  return {
    apply: argv.includes("--apply"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const container = getMechsContainer();

  const { resources } = await container.items
    .query<MechRawDoc>({
      query:
        "SELECT c.id, c._ts, c._etag, c.docType, c.class, c.tech, c.chassis, c.variant FROM c WHERE IS_DEFINED(c.chassis) AND IS_DEFINED(c.variant)",
    })
    .fetchAll();

  const byId = new Map<string, MechRawDoc[]>();
  for (const doc of resources) {
    const list = byId.get(doc.id) ?? [];
    list.push(doc);
    byId.set(doc.id, list);
  }

  const stale: Array<{ keep: MechRawDoc; remove: MechRawDoc[] }> = [];
  for (const docs of byId.values()) {
    if (docs.length <= 1) continue;
    const sorted = docs.slice().sort((a, b) => (b._ts ?? 0) - (a._ts ?? 0));
    stale.push({ keep: sorted[0], remove: sorted.slice(1) });
  }

  let removeCount = 0;
  for (const entry of stale) {
    for (const doc of entry.remove) {
      removeCount += 1;
      const line = `${args.apply ? "DELETE" : "DRY-RUN"} stale id=${doc.id} ts=${doc._ts ?? 0} chassis=${doc.chassis ?? ""} variant=${doc.variant ?? ""}; keep ts=${entry.keep._ts ?? 0}`;
      console.log(line);
      if (args.apply) {
        const partitionCandidates = [doc.id, doc.docType, doc.class, doc.tech, doc.chassis, undefined] as const;
        const attempted = new Set<string>();
        let deleted = false;
        for (const pk of partitionCandidates) {
          const key = pk ?? "__undefined__";
          if (attempted.has(key)) continue;
          attempted.add(key);
          try {
            await container.item(doc.id, pk as never).delete();
            deleted = true;
            break;
          } catch {
            // Try next candidate.
          }
        }
        if (!deleted) {
          throw new Error(`Unable to delete stale doc id=${doc.id}`);
        }
      }
    }
  }

  console.log(`Scanned=${resources.length} UniqueIds=${byId.size} DuplicateIdGroups=${stale.length} StaleDocs=${removeCount} Apply=${args.apply}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
