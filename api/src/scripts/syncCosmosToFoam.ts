import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import "./loadLocalEnv.js";
import { listMechs } from "../db/repositories/mechRepository.js";
import type { MechDoc } from "../types/contracts.js";

function toMarkdown(doc: MechDoc): string {
  const equipment = doc.metadata?.equipment ?? doc.equipment ?? [];
  const ranges = doc.metadata?.ranges;
  const className = doc.class ?? "Unknown";
  const tech = doc.tech ?? "Unknown";
  const tonnage = doc.tonnage ?? 0;
  const buildUrl = doc.link || doc.buildUrl || "";
  const rangeMin = doc.primaryRangeBracket?.[0] ?? ranges?.idealMin ?? 0;
  const rangeMax = doc.primaryRangeBracket?.[1] ?? ranges?.idealMax ?? 0;
  const optimalRange = doc.optimalRange ?? ranges?.optimal ?? 0;
  const maxRange = doc.maxRange ?? ranges?.max ?? 0;
  const equipmentList = equipment.map((item) => `  - ${item}`).join("\n") || "  - None listed";
  const buildCodesLines = Object.entries(doc.buildCodes)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n") || "  imported: pending";

  return `---\nid: ${doc.id}\nclass: ${className}\ntech: ${tech}\ntonnage: ${tonnage}\nchassis: ${doc.chassis}\nvariant: ${doc.variant}\nbuildUrl: ${buildUrl}\nskillCode: ${doc.skillCode}\nweaponry: \"${doc.weaponry.replaceAll("\"", "\\\"")}\"\nrole: ${doc.role}\nprimaryRangeBracket: [${rangeMin}, ${rangeMax}]\noptimalRange: ${optimalRange}\nmaxRange: ${maxRange}\nequipment:\n${equipmentList}\nbuildCodes:\n${buildCodesLines}\n---\n\n# ${doc.id}\n\n[[${className}]] [[${doc.chassis}]] [[${doc.variant}]]\n\n${doc.description}\n`;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const mechsDir = process.env.FOAM_MECHS_DIR ?? join(root, "..", "mwo_docs", "mechs");
  await mkdir(mechsDir, { recursive: true });

  const docs = await listMechs();
  for (const mech of docs) {
    const filePath = join(mechsDir, `${mech.id}.md`);
    await writeFile(filePath, toMarkdown(mech), "utf8");
  }

  console.log(`Synced ${docs.length} mechs from Cosmos DB to Foam markdown`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
