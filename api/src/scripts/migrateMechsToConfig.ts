import "./loadLocalEnv.js";
import { listMechs, upsertMechWithId } from "../db/repositories/mechRepository.js";

type Args = {
  ids: string[];
  limit: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ids: [], limit: 0, dryRun: true };

  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === "--ids") {
      const value = argv[i + 1] ?? "";
      args.ids = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (part === "--limit") {
      const value = Number(argv[i + 1] ?? "0");
      args.limit = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      i += 1;
      continue;
    }
    if (part === "--apply") {
      args.dryRun = false;
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const docs = await listMechs();

  let selected = docs;
  if (args.ids.length > 0) {
    const wanted = new Set(args.ids);
    selected = docs.filter((doc) => wanted.has(doc.id));
  } else if (args.limit > 0) {
    selected = docs.slice(0, args.limit);
  }

  if (selected.length === 0) {
    console.log("No mechs selected. Use --ids <id1,id2> or --limit <n>.");
    return;
  }

  let migrated = 0;
  let failed = 0;
  for (const doc of selected) {
    try {
      if (!args.dryRun) {
        await upsertMechWithId(doc.id, doc, doc.submittedBy);
      }
      migrated += 1;
      console.log(`${args.dryRun ? "DRY-RUN" : "APPLIED"} ${doc.id} :: ${doc.chassis} ${doc.variant}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAILED ${doc.id} :: ${doc.chassis} ${doc.variant} :: ${message}`);
    }
  }

  console.log(`Complete. migrated=${migrated} failed=${failed} dryRun=${args.dryRun}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
