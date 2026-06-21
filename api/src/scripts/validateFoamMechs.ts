import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import "./loadLocalEnv.js";
import { upsertMechInputSchema } from "../types/contracts.js";

type FrontmatterRecord = Record<string, unknown>;

function parseFrontmatter(markdown: string): FrontmatterRecord | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return null;
  }

  const data: FrontmatterRecord = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf(":");
    if (separator < 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let rawValue = trimmed.slice(separator + 1).trim();
    if (rawValue.startsWith("\"") && rawValue.endsWith("\"")) {
      rawValue = rawValue.slice(1, -1);
    }

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const items = rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => Number(item));
      data[key] = items;
      continue;
    }

    if (rawValue === "true" || rawValue === "false") {
      data[key] = rawValue === "true";
      continue;
    }

    if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      data[key] = Number(rawValue);
      continue;
    }

    data[key] = rawValue;
  }

  const equipmentBlock = markdown.match(/\nequipment:\n((?:\s*-\s.*\n)+)/);
  if (equipmentBlock) {
    data.equipment = equipmentBlock[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2));
  }

  const buildCodesBlock = markdown.match(/\nbuildCodes:\n((?:\s+[A-Za-z0-9_-]+:\s.*\n)+)/);
  if (buildCodesBlock) {
    const map: Record<string, string> = {};
    for (const line of buildCodesBlock[1].split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const sep = trimmed.indexOf(":");
      if (sep < 0) {
        continue;
      }
      map[trimmed.slice(0, sep).trim()] = trimmed.slice(sep + 1).trim();
    }
    data.buildCodes = map;
  }

  return data;
}

function resolveId(frontmatter: FrontmatterRecord, fileName: string): string {
  const idValue = frontmatter.id;
  if (typeof idValue === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idValue)) {
    return idValue;
  }

  const fileStem = basename(fileName, ".md");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fileStem)) {
    return fileStem;
  }

  return randomUUID();
}

async function main(): Promise<void> {
  const root = process.cwd();
  const mechsDir = process.env.FOAM_MECHS_DIR ?? join(root, "..", "mwo_docs", "mechs");
  const entries = await readdir(mechsDir, { withFileTypes: true });

  const failures: string[] = [];
  let checked = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name.endsWith(".template.md")) {
      continue;
    }

    const filePath = join(mechsDir, entry.name);
    const content = await readFile(filePath, "utf8");
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      continue;
    }

    checked += 1;
    const id = resolveId(frontmatter, entry.name);
    const parsed = upsertMechInputSchema.safeParse({ ...frontmatter, id });
    if (!parsed.success) {
      failures.push(`${entry.name}: ${parsed.error.message}`);
    }
  }

  if (failures.length > 0) {
    console.error("Foam mech validation failed:\n" + failures.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log(`Foam mech validation passed (${checked} document(s) checked)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
