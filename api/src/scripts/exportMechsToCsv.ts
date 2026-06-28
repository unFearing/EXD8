import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import "./loadLocalEnv.js";
import { listMechs } from "../db/repositories/mechRepository.js";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function toCsvRow(values: Array<string | number>): string {
  return values.map((value) => csvEscape(String(value))).join(",");
}

async function main(): Promise<void> {
  const root = process.cwd();
  const backupDir = process.env.COSMOS_EXPORT_DIR ?? join(root, "..", "backups", "cosmos");
  await mkdir(backupDir, { recursive: true });

  const now = new Date();
  const stamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  const docs = await listMechs();

  const header = toCsvRow([
    "id",
    "class",
    "tech",
    "tonnage",
    "chassis",
    "variant",
    "buildUrl",
    "skillCode",
    "weaponry",
    "equipment",
    "description",
    "role",
    "buildCodes",
    "primaryRangeBracketMin",
    "primaryRangeBracketMax",
    "optimalRange",
    "maxRange",
    "schemaVersion",
    "docType",
  ]);

  const rows = docs.map((doc) =>
    toCsvRow([
      doc.id,
      doc.class ?? "",
      doc.tech ?? "",
      doc.tonnage ?? "",
      doc.chassis,
      doc.variant,
      doc.buildUrl ?? doc.link ?? "",
      doc.skillCode,
      doc.weaponry,
      JSON.stringify(doc.metadata?.equipment ?? doc.equipment ?? []),
      doc.description,
      doc.role,
      JSON.stringify(doc.buildCodes),
      doc.primaryRangeBracket?.[0] ?? doc.metadata?.ranges?.idealMin ?? "",
      doc.primaryRangeBracket?.[1] ?? doc.metadata?.ranges?.idealMax ?? "",
      doc.optimalRange ?? doc.metadata?.ranges?.optimal ?? "",
      doc.maxRange ?? doc.metadata?.ranges?.max ?? "",
      doc.schemaVersion,
      doc.docType ?? "mech",
    ])
  );

  const csv = [header, ...rows].join("\n") + "\n";
  const filePath = join(backupDir, `mechs-${stamp}.csv`);
  await writeFile(filePath, csv, "utf8");

  console.log(`Exported ${docs.length} mechs to ${filePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
