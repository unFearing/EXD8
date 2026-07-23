import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

type CatalogEntry = ResolvedConfigMech & {
  chassisCode?: string;
};

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
  // Common shorthand for hero variants.
  "bsw-hr": ["high roller"],
  "high roller": ["bsw-hr"],
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeVariantToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeSubmittedVariant(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

function isCodeLikeVariant(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9()]+)+$/i.test(value.trim());
}

function inferChassisCode(chassisDef: MechsConfigChassis): string | undefined {
  const explicit = (chassisDef.chassis_code ?? "").trim();
  if (explicit) return explicit;

  const counts = new Map<string, number>();
  for (const rawVariant of chassisDef.variants ?? []) {
    const variant = rawVariant.trim();
    const match = variant.match(/^([a-z0-9]+)-/i);
    if (!match) continue;
    const token = match[1].toUpperCase();
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  let bestToken = "";
  let bestCount = 0;
  for (const [token, count] of counts.entries()) {
    if (count > bestCount) {
      bestToken = token;
      bestCount = count;
    }
  }

  return bestToken || undefined;
}

function getVariantInitialisms(value: string): string[] {
  const tokens = (value.match(/[a-z0-9]+/gi) ?? [])
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 1 || token === "x");

  if (!tokens.length) return [];

  const noStopTokens = tokens.filter((token) => !["the", "a", "an", "of", "and", "st", "saint"].includes(token));
  const full = tokens.map((token) => token[0]).join("").toUpperCase();
  const reduced = noStopTokens.map((token) => token[0]).join("").toUpperCase();

  return Array.from(new Set([full, reduced].filter(Boolean)));
}

function getVariantSuffixToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("-").filter(Boolean);
  if (!parts.length) return "";
  return parts[parts.length - 1]?.toUpperCase() ?? "";
}

function entryMatchesChassis(entry: CatalogEntry, normChassis: string): boolean {
  if (normalizeToken(entry.chassis) === normChassis) return true;
  const code = normalizeToken(entry.chassisCode ?? "");
  return Boolean(code) && code === normChassis;
}

function buildVariantAliases(entry: CatalogEntry): Set<string> {
  const aliases = new Set<string>();
  const variant = entry.variant.trim();
  const normalized = normalizeToken(variant);
  aliases.add(normalized);

  const compact = normalizeVariantToken(variant);
  if (compact) aliases.add(compact);

  for (const alias of LEGACY_VARIANT_ALIASES[normalized] ?? []) {
    aliases.add(normalizeToken(alias));
    aliases.add(normalizeVariantToken(alias));
  }

  // Name-like hero/legend variants may be submitted as CODE-XX shorthand.
  if (variant && !isCodeLikeVariant(variant) && entry.chassisCode) {
    const initialisms = getVariantInitialisms(variant);
    const variantToken = normalizeVariantToken(variant).toUpperCase();
    const chassisCode = entry.chassisCode.toUpperCase();

    for (const initialism of initialisms) {
      aliases.add(normalizeToken(`${chassisCode}-${initialism}`));
      aliases.add(normalizeVariantToken(`${chassisCode}-${initialism}`));
      aliases.add(normalizeToken(initialism));
      aliases.add(normalizeVariantToken(initialism));
    }

    if (variantToken) {
      aliases.add(normalizeToken(`${chassisCode}-${variantToken}`));
      aliases.add(normalizeVariantToken(`${chassisCode}-${variantToken}`));
    }
  }

  return aliases;
}

function getVariantMatchRank(entry: CatalogEntry, variantCandidates: string[], normalizedVariantCandidates: Set<string>): number {
  const entryVariant = normalizeToken(entry.variant);
  const entryCompact = normalizeVariantToken(entry.variant);

  // Rank 2: direct canonical variant match (exact token or punctuation-insensitive token).
  if (variantCandidates.includes(entryVariant) || normalizedVariantCandidates.has(entryCompact)) {
    return 2;
  }

  // Rank 1: generated alias match (hero/legend shorthand and legacy aliases).
  const aliases = buildVariantAliases(entry);
  for (const candidate of variantCandidates) {
    if (aliases.has(candidate)) return 1;
  }
  for (const candidate of normalizedVariantCandidates) {
    if (aliases.has(candidate)) return 1;
  }

  return 0;
}

function pickBestRank(matches: Array<{ entry: CatalogEntry; rank: number }>): CatalogEntry[] {
  let best = 0;
  for (const match of matches) {
    if (match.rank > best) best = match.rank;
  }
  if (best === 0) return [];
  return matches.filter((match) => match.rank === best).map((match) => match.entry);
}

function candidateConfigPaths(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    process.env.MECHS_CONFIG_PATH?.trim(),
    resolve(moduleDir, "../mechs_config.json"),
    resolve(process.cwd(), "dist/mechs_config.json"),
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
        const chassisCode = inferChassisCode(chassisDef);
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
            chassisCode,
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
  const rawVariant = normalizeSubmittedVariant(variant);
  const normVariant = normalizeToken(rawVariant);
  const entries = loadConfigEntries();

  if (!normChassis || !normVariant || !rawVariant || !entries.length) {
    return { status: "not_found" };
  }

  const variantCandidates = [normVariant, ...(LEGACY_VARIANT_ALIASES[normVariant] ?? [])];
  const normalizedVariantCandidates = new Set(variantCandidates.map((candidate) => normalizeVariantToken(candidate)));

  const exactMatches = pickBestRank(entries.map((entry) => {
    if (techHint && entry.tech !== techHint) return false;
    if (!entryMatchesChassis(entry, normChassis)) return false;
    return { entry, rank: getVariantMatchRank(entry, variantCandidates, normalizedVariantCandidates) };
  }).filter((value): value is { entry: CatalogEntry; rank: number } => Boolean(value)));

  if (exactMatches.length === 1) {
    return { status: "ok", value: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return { status: "ambiguous", candidates: exactMatches };
  }

  const variantMatches = pickBestRank(entries.map((entry) => {
    if (techHint && entry.tech !== techHint) return false;
    return { entry, rank: getVariantMatchRank(entry, variantCandidates, normalizedVariantCandidates) };
  }).filter((value): value is { entry: CatalogEntry; rank: number } => Boolean(value)));

  if (variantMatches.length === 1) {
    return { status: "ok", value: variantMatches[0] };
  }
  if (variantMatches.length > 1) {
    return { status: "ambiguous", candidates: variantMatches };
  }

  if (techHint) {
    const fallbackExact = pickBestRank(entries
      .filter((entry) => entryMatchesChassis(entry, normChassis))
      .map((entry) => ({
        entry,
        rank: getVariantMatchRank(entry, variantCandidates, normalizedVariantCandidates),
      })));
    if (fallbackExact.length === 1) {
      return { status: "ok", value: fallbackExact[0] };
    }
    if (fallbackExact.length > 1) {
      return { status: "ambiguous", candidates: fallbackExact };
    }

    const fallbackVariant = pickBestRank(entries.map((entry) => ({
      entry,
      rank: getVariantMatchRank(entry, variantCandidates, normalizedVariantCandidates),
    })));
    if (fallbackVariant.length === 1) {
      return { status: "ok", value: fallbackVariant[0] };
    }
    if (fallbackVariant.length > 1) {
      return { status: "ambiguous", candidates: fallbackVariant };
    }
  }

  // Dynamic fallback: if the chassis is known and the submitted variant follows
  // that chassis code pattern (e.g. EXE-CH), accept it even when the exact
  // variant string is not present in mechs_config.
  const chassisMatches = entries.filter((entry) => {
    if (techHint && entry.tech !== techHint) return false;
    return entryMatchesChassis(entry, normChassis);
  });
  const chassisFallbackPool = chassisMatches.length
    ? chassisMatches
    : entries.filter((entry) => entryMatchesChassis(entry, normChassis));

  // Chassis-scoped shorthand fallback: ENF-GH should resolve to GHILLIE when
  // the chassis is known and the suffix uniquely prefixes a canonical variant.
  if (chassisFallbackPool.length) {
    const suffixToken = getVariantSuffixToken(rawVariant);
    if (suffixToken.length >= 2) {
      const shorthandMatches = chassisFallbackPool.filter((entry) => {
        if (techHint && entry.tech !== techHint) return false;
        const canonical = normalizeVariantToken(entry.variant).toUpperCase();
        return canonical.startsWith(suffixToken);
      });

      if (shorthandMatches.length === 1) {
        return { status: "ok", value: shorthandMatches[0] };
      }

      if (shorthandMatches.length > 1) {
        return { status: "ambiguous", candidates: shorthandMatches };
      }
    }
  }

  if (chassisFallbackPool.length) {
    const variantCompact = normalizeVariantToken(rawVariant).toUpperCase();
    const codePrefixes = Array.from(
      new Set(
        chassisFallbackPool
          .map((entry) => normalizeVariantToken(entry.chassisCode ?? "").toUpperCase())
          .filter(Boolean),
      ),
    );
    const matchesKnownCodePrefix = codePrefixes.some((prefix) => variantCompact.startsWith(prefix));
    if (isCodeLikeVariant(rawVariant) && matchesKnownCodePrefix) {
      const byTech = new Map<ConfigTech, CatalogEntry>();
      for (const entry of chassisFallbackPool) {
        byTech.set(entry.tech, entry);
      }
      const candidates = Array.from(byTech.values()).map((entry) => ({
        ...entry,
        variant: rawVariant.toUpperCase(),
      }));

      if (candidates.length === 1) {
        return { status: "ok", value: candidates[0] };
      }
      return { status: "ambiguous", candidates };
    }
  }

  return { status: "not_found" };
}
