import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { upsertMechInputSchema } from "../types/contracts.js";
import { upsertMechWithId } from "../db/repositories/mechRepository.js";

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

  // Parse simple bullet-list arrays for equipment.
  const equipmentBlock = markdown.match(/\nequipment:\n((?:\s*-\s.*\n)+)/);
  if (equipmentBlock) {
    data.equipment = equipmentBlock[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2));
  }

  // Parse simple key-value map block for buildCodes.
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
      const key = trimmed.slice(0, sep).trim();
      const value = trimmed.slice(sep + 1).trim();
      map[key] = value;
    }
    data.buildCodes = map;
  }

  return data;
}

function toMechId(frontmatter: FrontmatterRecord, fileName: string): string {
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

  let upserted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const content = await readFile(join(mechsDir, entry.name), "utf8");
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      continue;
    }

    const id = toMechId(frontmatter, entry.name);
    const parsed = upsertMechInputSchema.safeParse({
      ...frontmatter,
      id,
    });
    if (!parsed.success) {
      throw new Error(`Invalid mech frontmatter in ${entry.name}: ${parsed.error.message}`);
    }

    await upsertMechWithId(id, parsed.data);
    upserted += 1;
  }

  console.log(`Synced ${upserted} mech markdown files to Cosmos DB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
