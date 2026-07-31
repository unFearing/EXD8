/**
 * Re-parse export codes for all mechs that have a NAV-Alpha build link.
 *
 * Usage:
 *   npm run build && node dist/scripts/reparseBuildCodes.js          # dry-run
 *   npm run build && node dist/scripts/reparseBuildCodes.js --apply  # write to Cosmos
 */
import "./loadLocalEnv.js";
import { parseMechBuildHandler } from "../functions/mechs/parseBuild.js";
import { listMechs } from "../db/repositories/mechRepository.js";
import { getMechsContainer } from "../db/cosmos.js";

type Args = { apply: boolean };

function parseArgs(argv: string[]): Args {
  return { apply: argv.includes("--apply") };
}

async function parseExportCode(url: string): Promise<string | null> {
  const request = { json: async () => ({ url }) };
  const response = await parseMechBuildHandler(request as never);
  if (response.status !== 200) return null;
  const body = response.jsonBody as { data?: { draft?: { buildCodes?: Record<string, string> } } };
  return body?.data?.draft?.buildCodes?.export ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mechs = await listMechs();

  const withLink = mechs.filter((m) => {
    const link = m.link || m.buildUrl || "";
    return link.includes("nav-alpha.com");
  });

  console.log(`Total mechs: ${mechs.length} | With NAV-Alpha link: ${withLink.length} | Apply: ${args.apply}\n`);

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const mech of withLink) {
    const link = mech.link || mech.buildUrl || "";
    const oldCode = mech.buildCodes?.export ?? "(none)";

    let newCode: string | null;
    try {
      newCode = await parseExportCode(link);
    } catch (err) {
      console.error(`  FAIL  ${mech.variant} (${mech.id}) — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
      continue;
    }

    if (!newCode) {
      console.log(`  SKIP  ${mech.variant} (${mech.id}) — no export code returned`);
      failed++;
      continue;
    }

    if (newCode === oldCode) {
      console.log(`  SAME  ${mech.variant} — already correct`);
      unchanged++;
      continue;
    }

    console.log(`  ${args.apply ? "UPDATE" : "DRY-RUN"} ${mech.variant} (${mech.id})`);
    console.log(`    old: ${oldCode}`);
    console.log(`    new: ${newCode}`);

    if (args.apply) {
      const updatedDoc = {
        ...mech,
        buildCodes: { ...mech.buildCodes, export: newCode },
      };
      const container = getMechsContainer();
      await container.items.upsert(updatedDoc);
    }

    updated++;
  }

  console.log(`\nDone. Updated=${updated} Unchanged=${unchanged} Failed=${failed}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
