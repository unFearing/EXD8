import "./loadLocalEnv.js";
import { getMechsContainer } from "../db/cosmos.js";

type CosmosDoc = Record<string, unknown> & {
  id: string;
  buildCodes?: Record<string, string>;
};

type Args = {
  apply: boolean;
};

type MigrationSummary = {
  scanned: number;
  matched: number;
  updated: number;
  failed: number;
};

function parseArgs(argv: string[]): Args {
  return {
    apply: argv.includes("--apply"),
  };
}

function removeSystemFields(doc: CosmosDoc): Record<string, unknown> {
  const { _rid, _self, _etag, _attachments, _ts, ...rest } = doc;
  return rest;
}

function stripExportBuildCodeKeys(codes: Record<string, string>): { changed: boolean; next: Record<string, string> } {
  let changed = false;
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(codes)) {
    if (key.trim().toLowerCase() === "export") {
      changed = true;
      continue;
    }
    next[key] = value;
  }

  return { changed, next };
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const container = getMechsContainer();

  const { resources } = await container.items
    .query<CosmosDoc>({
      query: "SELECT * FROM c WHERE IS_DEFINED(c.buildCodes)",
    })
    .fetchAll();

  const summary: MigrationSummary = {
    scanned: resources.length,
    matched: 0,
    updated: 0,
    failed: 0,
  };

  for (const doc of resources) {
    const buildCodes = doc.buildCodes;
    if (!buildCodes || typeof buildCodes !== "object") {
      continue;
    }

    const { changed, next } = stripExportBuildCodeKeys(buildCodes);
    if (!changed) {
      continue;
    }

    summary.matched += 1;
    console.log(`${apply ? "APPLY" : "DRY-RUN"} id=${doc.id} remove export build code keys`);

    if (!apply) {
      continue;
    }

    try {
      const nextDoc = {
        ...removeSystemFields(doc),
        buildCodes: next,
      };
      await container.items.upsert(nextDoc);
      summary.updated += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(`FAILED id=${doc.id}`, error);
    }
  }

  console.log(
    `Scanned=${summary.scanned} Matched=${summary.matched} Updated=${summary.updated} Failed=${summary.failed} Apply=${apply}`,
  );

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
