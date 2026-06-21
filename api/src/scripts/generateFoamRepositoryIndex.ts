import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import "./loadLocalEnv.js";
import { getMechHierarchy } from "../db/repositories/mechRepository.js";

function toClassSlug(weightClass: string): string {
  return weightClass.toLowerCase();
}

function toClassTitle(weightClass: string): string {
  switch (weightClass) {
    case "Light":
      return "Lights";
    case "Medium":
      return "Mediums";
    case "Heavy":
      return "Heavies";
    case "Assault":
      return "Assaults";
    default:
      return `${weightClass}s`;
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const outputDir = process.env.FOAM_MECHS_DIR ? join(process.env.FOAM_MECHS_DIR, "..") : join(root, "..", "mwo_docs");
  await mkdir(outputDir, { recursive: true });

  const hierarchy = await getMechHierarchy();
  const lines: string[] = [
    "# Repository Navigation",
    "",
    "This file is generated from Cosmos DB mech entries.",
    "",
    "## Weight Classes",
    "",
  ];

  for (const classSummary of hierarchy) {
    const classTitle = toClassTitle(classSummary.class);
    const classSlug = toClassSlug(classSummary.class);
    lines.push(`- [${classTitle}](./repository/${classSlug}.md)`);
  }

  lines.push("");

  const classOutputDir = join(outputDir, "repository");
  await mkdir(classOutputDir, { recursive: true });

  for (const classSummary of hierarchy) {
    const classTitle = toClassTitle(classSummary.class);
    const classSlug = toClassSlug(classSummary.class);
    const chassisSummary = classSummary.chassis.map((entry) => `${entry.chassis} (${entry.buildCount})`).join(", ");
    const classLines: string[] = [
      `# ${classTitle}`,
      "",
      "This file is generated from Cosmos DB mech entries.",
      "",
      `- ${classTitle}: ${chassisSummary || "No entries"}`,
      "",
    ];

    for (const chassis of classSummary.chassis) {
      classLines.push(`## ${chassis.chassis}`);
      classLines.push("");
      for (const variant of chassis.variants) {
        classLines.push(`- ${variant.variant}: ${variant.buildCount} build${variant.buildCount === 1 ? "" : "s"}`);
      }
      classLines.push("");
    }

    const classPath = join(classOutputDir, `${classSlug}.md`);
    await writeFile(classPath, `${classLines.join("\n")}\n`, "utf8");
    console.log(`Generated class repository navigation at ${classPath}`);
  }

  const outPath = join(outputDir, "repository-index.md");
  await writeFile(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Generated Foam repository navigation at ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
