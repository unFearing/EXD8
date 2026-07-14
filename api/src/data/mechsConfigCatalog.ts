import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type ConfigTech = "IS" | "Clan";
type ConfigClass = "LIGHT" | "MEDIUM" | "HEAVY" | "ASSAULT";

type MechsConfigChassis = {
  chassis_name: string;
  tonnage: number;
  chassis_code: string;
  variants: string[];
};

type MechsConfigFile = {
  mechs: Record<ConfigTech, Record<ConfigClass, Record<string, MechsConfigChassis>>>;
};

export type ResolvedConfigMech = {
  tech: ConfigTech;
  className: "Light" | "Medium" | "Heavy" | "Assault";
  tonnage: number;
  chassis: string;
  variant: string;
};

type ResolveResult =
  | { status: "ok"; value: ResolvedConfigMech }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: ResolvedConfigMech[] };

type CatalogEntry = ResolvedConfigMech;

const classMap: Record<ConfigClass, "Light" | "Medium" | "Heavy" | "Assault"> = {
  LIGHT: "Light",
  MEDIUM: "Medium",
  HEAVY: "Heavy",
  ASSAULT: "Assault",
};

let cachedEntries: CatalogEntry[] | null = null;

const LEGACY_VARIANT_ALIASES: Record<string, string[]> = {
  // Legacy short tokens seen in historical Cosmos docs.
  "fmt-al": ["aletha"],
  "fs9-fs": ["firestorm"],
  "bane-l": ["leviathan"],
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function candidateConfigPaths(): string[] {
  return [
    process.env.MECHS_CONFIG_PATH?.trim(),
    resolve(process.cwd(), "../app/public/mechs_config.json"),
    resolve(process.cwd(), "app/public/mechs_config.json"),
  ].filter((value): value is string => Boolean(value));
}

function loadConfigEntries(): CatalogEntry[] {
  if (cachedEntries) {
    return cachedEntries;
  }

  let parsed: MechsConfigFile | null = null;
  for (const path of candidateConfigPaths()) {
    if (!existsSync(path)) continue;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8")) as MechsConfigFile;
      break;
    } catch {
      continue;
    }
  }

  if (!parsed) {
    cachedEntries = [];
    return cachedEntries;
  }

  const entries: CatalogEntry[] = [];
  for (const [tech, classes] of Object.entries(parsed.mechs) as Array<[ConfigTech, Record<ConfigClass, Record<string, MechsConfigChassis>>]>) {
    for (const [bucketClass, chassisMapValue] of Object.entries(classes) as Array<[ConfigClass, Record<string, MechsConfigChassis>]>) {
      for (const [fallbackName, chassisDef] of Object.entries(chassisMapValue)) {
        const chassis = (chassisDef.chassis_name ?? fallbackName).trim();
        const tonnage = typeof chassisDef.tonnage === "number" ? chassisDef.tonnage : 50;
        for (const rawVariant of chassisDef.variants ?? []) {
          const variant = rawVariant.trim();
          if (!variant) continue;
          entries.push({
            tech,
            className: classMap[bucketClass],
            tonnage,
            chassis,
            variant,
          });
        }
      }
    }
  }

  cachedEntries = entries;
  return entries;
}

export function resolveConfigMech(chassis: string, variant: string, techHint?: ConfigTech): ResolveResult {
  const normChassis = normalizeToken(chassis);
  const normVariant = normalizeToken(variant);
  const entries = loadConfigEntries();

  if (!normChassis || !normVariant || !entries.length) {
    return { status: "not_found" };
  }

  const variantCandidates = [normVariant, ...(LEGACY_VARIANT_ALIASES[normVariant] ?? [])];

  const exactMatches = entries.filter((entry) => {
    if (techHint && entry.tech !== techHint) return false;
    return normalizeToken(entry.chassis) === normChassis && variantCandidates.includes(normalizeToken(entry.variant));
  });

  if (exactMatches.length === 1) {
    return { status: "ok", value: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return { status: "ambiguous", candidates: exactMatches };
  }

  const variantMatches = entries.filter((entry) => {
    if (techHint && entry.tech !== techHint) return false;
    return variantCandidates.includes(normalizeToken(entry.variant));
  });

  if (variantMatches.length === 1) {
    return { status: "ok", value: variantMatches[0] };
  }
  if (variantMatches.length > 1) {
    return { status: "ambiguous", candidates: variantMatches };
  }

  if (techHint) {
    const fallbackExact = entries.filter((entry) => {
      return normalizeToken(entry.chassis) === normChassis && variantCandidates.includes(normalizeToken(entry.variant));
    });
    if (fallbackExact.length === 1) {
      return { status: "ok", value: fallbackExact[0] };
    }
    if (fallbackExact.length > 1) {
      return { status: "ambiguous", candidates: fallbackExact };
    }

    const fallbackVariant = entries.filter((entry) => variantCandidates.includes(normalizeToken(entry.variant)));
    if (fallbackVariant.length === 1) {
      return { status: "ok", value: fallbackVariant[0] };
    }
    if (fallbackVariant.length > 1) {
      return { status: "ambiguous", candidates: fallbackVariant };
    }
  }

  return { status: "not_found" };
}
