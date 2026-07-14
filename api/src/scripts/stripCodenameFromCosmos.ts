import "./loadLocalEnv.js";
import { getMechsContainer, getMatchNightsContainer } from "../db/cosmos.js";

type CosmosDoc = Record<string, unknown> & { id: string; docType?: string };

type CleanupResult = {
  container: string;
  scanned: number;
  updated: number;
  skipped: number;
};

function parseArgs(argv: string[]): { apply: boolean } {
  return { apply: argv.includes("--apply") };
}

function cloneWithoutCodename(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneWithoutCodename(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (key === "codename") {
      continue;
    }
    output[key] = cloneWithoutCodename(child);
  }
  return output;
}

function removeSystemFields(doc: CosmosDoc): Record<string, unknown> {
  const { _rid, _self, _etag, _attachments, _ts, ...rest } = doc;
  return rest;
}

function hasCodename(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasCodename(item));
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const input = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(input, "codename")) {
    return true;
  }

  return Object.values(input).some((child) => hasCodename(child));
}

async function cleanupContainer(containerName: string, container: ReturnType<typeof getMechsContainer>, apply: boolean): Promise<CleanupResult> {
  const { resources } = await container.items.query<CosmosDoc>({ query: "SELECT * FROM c" }).fetchAll();
  let updated = 0;
  let skipped = 0;

  for (const doc of resources) {
    const cleaned = cloneWithoutCodename(doc) as Record<string, unknown>;
    if (!hasCodename(doc)) {
      skipped += 1;
      continue;
    }

    updated += 1;
    console.log(`${apply ? "APPLY" : "DRY-RUN"} ${containerName} ${doc.id}`);
    if (apply) {
      await container.items.upsert(removeSystemFields(cleaned as CosmosDoc));
    }
  }

  return {
    container: containerName,
    scanned: resources.length,
    updated,
    skipped,
  };
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const results: CleanupResult[] = [];

  results.push(await cleanupContainer("Mechs", getMechsContainer(), apply));
  results.push(await cleanupContainer("Decks", getMatchNightsContainer(), apply));

  for (const result of results) {
    console.log(`${result.container}: scanned=${result.scanned} updated=${result.updated} skipped=${result.skipped}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
