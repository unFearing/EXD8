import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import "./loadLocalEnv.js";
import { listMechs } from "../db/repositories/mechRepository.js";

function toMarkdown(doc: {
  id: string;
  class: string;
  tech: string;
  tonnage: number;
  chassis: string;
  variant: string;
  buildUrl: string;
  skillCode: string;
  weaponry: string;
  equipment: string[];
  description: string;
  role: string;
  buildCodes: Record<string, string>;
  primaryRangeBracket: [number, number];
  optimalRange: number;
  maxRange: number;
}): string {
  const equipmentList = doc.equipment.map((item) => `  - ${item}`).join("\n");
  const buildCodesLines = Object.entries(doc.buildCodes)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n");

  return `---\nid: ${doc.id}\nclass: ${doc.class}\ntech: ${doc.tech}\ntonnage: ${doc.tonnage}\nchassis: ${doc.chassis}\nvariant: ${doc.variant}\nbuildUrl: ${doc.buildUrl}\nskillCode: ${doc.skillCode}\nweaponry: \"${doc.weaponry.replaceAll("\"", "\\\"")}\"\nrole: ${doc.role}\nprimaryRangeBracket: [${doc.primaryRangeBracket[0]}, ${doc.primaryRangeBracket[1]}]\noptimalRange: ${doc.optimalRange}\nmaxRange: ${doc.maxRange}\nequipment:\n${equipmentList}\nbuildCodes:\n${buildCodesLines}\n---\n\n# ${doc.id}\n\n[[${doc.class}]] [[${doc.chassis}]] [[${doc.variant}]]\n\n${doc.description}\n`;
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
