import { app, type HttpRequest } from "@azure/functions";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fail, ok } from "../../middleware/http.js";
import type { CreateMechInput, WeightClass } from "../../types/contracts.js";

type ParseBuildResponse = {
  sourceUrl: string;
  warnings: string[];
  metadata: Record<string, string | number | boolean | null>;
  draft: CreateMechInput;
};

const REQUEST_TIMEOUT_MS = 7000;
const NAV_ALPHA_BUILD_API_URL = "https://mwo.nav-alpha.com/api/build/";
const NAV_ALPHA_MECHS_API_URL = "https://mwo.nav-alpha.com/api/mechs/";
const NAV_ALPHA_EQUIPMENT_API_URL = "https://mwo.nav-alpha.com/api/equipment/";
const RENDER_PROXY_BASE_URL = "https://r.jina.ai/http://";
const NAV_ALPHA_NATIVE_SECRET = "gIRb6VRI6Ox99xSgSQl74FC3XMqJAnIRb6l5i1lQCW6KaW8E9x76Az4iQtW8ESl5";
const NAV_ALPHA_BASE64 = "0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmno";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type NavAlphaApiResponse = {
  ok?: boolean;
  data?: JsonValue;
  message?: string;
};

type NavAlphaSharedBuild = {
  token?: string;
  variant?: string;
  loadout?: string;
  author?: string;
};

type NavAlphaPublicMech = {
  name?: string;
  id_code?: string;
  faction?: string;
  omni?: string | number | boolean;
  armor_type?: string;
  structure_type?: string;
  heatsink_type?: string;
  guidance_type?: string;
  stock_loadout?: string;
};

type NavAlphaEquipmentItem = {
  id?: string | number;
  id_code?: string;
  item_type?: string;
  fixed?: boolean | number | string;
};

type NavAlphaOmnipodItem = {
  id?: string | number;
  id_code?: string;
  component?: string;
  chassis?: string;
};

type CachedVariant = {
  tech?: "IS" | "Clan";
  label?: string;
};

type CachedChassis = {
  chassis: string;
  defaultTech: "IS" | "Clan";
  tonnage: number;
  variants?: Record<string, CachedVariant>;
};

type MechsConfigEntry = {
  chassis_name?: string;
  tonnage?: number;
  chassis_code?: string;
  variants?: string[];
};

type MechsConfigFile = {
  mechs?: Record<string, Record<string, Record<string, MechsConfigEntry>>>;
};

type MechsConfigCatalog = {
  byCode: Record<string, CachedChassis>;
  byVariant: Record<string, CachedChassis>;
};

type NavAlphaExportLoadout = {
  items?: Record<string, number[]>;
  armor_type?: string;
  structure_type?: string;
  heatsink_type?: string;
  guidance_type?: string;
  armor?: Record<string, number>;
  omnipods?: Record<string, number>;
  actuators?: Record<string, number>;
};

const MWO_EXPORT_CODE_REGEX = /\bA[0-9A-Za-z:;<=>?@\[\]\\^_`|+\-]{20,}\b/g;
const NAV_ALPHA_UPGRADE_MAP = {
  clan: {
    armor: { std: 5, ferro: 4 },
    structure: { std: 24, endo: 16 },
    heatsinks: { double: 4, single: 6 },
    guidance: { std: 0, artemis: 1 },
  },
  inner_sphere: {
    armor: { std: 0, ferro: 1, "light-ferro": 2, stealth: 3 },
    structure: { std: 0, endo: 8 },
    heatsinks: { single: 0, double: 2 },
    guidance: { std: 0, artemis: 1 },
  },
} as const;

let navAlphaMechsPromise: Promise<NavAlphaPublicMech[]> | undefined;
let navAlphaEquipmentPromise: Promise<NavAlphaEquipmentItem[]> | undefined;
let navAlphaOmnipodsPromise: Promise<NavAlphaOmnipodItem[]> | undefined;

function deriveCodeFromVariant(variant: string): string {
  const normalized = variant.trim().toUpperCase();
  const parts = normalized.split("-");
  if (parts.length >= 2 && parts[1] === "IIC") {
    return `${parts[0]}-IIC`;
  }
  return parts[0] ?? normalized;
}

function navAlphaPublicAuthHeader(): string {
  const iss = Date.now().toString();
  const sig = createHash("sha256").update(iss + NAV_ALPHA_NATIVE_SECRET).digest("hex");
  return `Native ${JSON.stringify({ iss, sig })}`;
}

async function fetchNavAlphaPublicJson(url: string, refererUrl: string, init?: RequestInit): Promise<JsonValue> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: navAlphaPublicAuthHeader(),
        origin: "https://mwo.nav-alpha.com",
        referer: refererUrl,
        accept: "application/json, text/plain, */*",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Public NAV-Alpha endpoint returned HTTP ${response.status}`);
    }

    return (await response.json()) as JsonValue;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeNavAlphaResponseData(body: JsonValue): JsonValue {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Public NAV-Alpha endpoint returned invalid JSON");
  }
  const okValue = "ok" in body ? body.ok : undefined;
  const dataValue = "data" in body ? body.data : undefined;
  const messageValue = "message" in body ? body.message : undefined;
  if (okValue !== true) {
    throw new Error(typeof messageValue === "string" ? messageValue : "Public NAV-Alpha endpoint returned no data");
  }
  return dataValue ?? null;
}

async function fetchBuildFromPublicNavAlpha(buildToken: string, sourceUrl: string): Promise<NavAlphaSharedBuild> {
  const body = await fetchNavAlphaPublicJson(`${NAV_ALPHA_BUILD_API_URL}?token=${encodeURIComponent(buildToken)}`, sourceUrl);
  const data = decodeNavAlphaResponseData(body);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Public NAV-Alpha build payload was not an object");
  }
  return data as NavAlphaSharedBuild;
}

async function fetchNavAlphaMechsCatalog(refererUrl: string): Promise<NavAlphaPublicMech[]> {
  navAlphaMechsPromise ??= (async () => {
    const body = await fetchNavAlphaPublicJson(NAV_ALPHA_MECHS_API_URL, refererUrl, {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    const data = decodeNavAlphaResponseData(body);
    if (!Array.isArray(data)) {
      throw new Error("Public NAV-Alpha mechs payload was not a list");
    }
    return data as NavAlphaPublicMech[];
  })();
  return navAlphaMechsPromise;
}

async function fetchNavAlphaEquipmentCatalog(refererUrl: string): Promise<NavAlphaEquipmentItem[]> {
  navAlphaEquipmentPromise ??= (async () => {
    const body = await fetchNavAlphaPublicJson(NAV_ALPHA_EQUIPMENT_API_URL, refererUrl);
    const data = decodeNavAlphaResponseData(body);
    if (!Array.isArray(data)) {
      throw new Error("Public NAV-Alpha equipment payload was not a list");
    }
    return data as NavAlphaEquipmentItem[];
  })();
  return navAlphaEquipmentPromise;
}

async function fetchNavAlphaOmnipodsCatalog(refererUrl: string): Promise<NavAlphaOmnipodItem[]> {
  navAlphaOmnipodsPromise ??= (async () => {
    const body = await fetchNavAlphaPublicJson("https://mwo.nav-alpha.com/api/omnipods/", refererUrl);
    const data = decodeNavAlphaResponseData(body);
    if (!Array.isArray(data)) {
      throw new Error("Public NAV-Alpha omnipods payload was not a list");
    }
    return data as NavAlphaOmnipodItem[];
  })();
  return navAlphaOmnipodsPromise;
}

function navAlphaDecTo64(value: number, minLength = 0): string {
  if (value < 0) return "";
  let current = value;
  let encoded = "";
  let targetLength = minLength;
  if (current === 0 && targetLength === 0) {
    targetLength = 1;
  }
  while (current > 0) {
    encoded += NAV_ALPHA_BASE64[current % 64] ?? "";
    current = Math.floor(current / 64);
  }
  while (targetLength > 0 && encoded.length < targetLength) {
    encoded += "0";
  }
  return encoded;
}

async function computePublicNavAlphaExportCode(sharedBuild: NavAlphaSharedBuild, refererUrl: string): Promise<string | null> {
  if (!sharedBuild.variant || !sharedBuild.loadout) return null;

  let loadout: NavAlphaExportLoadout;
  try {
    loadout = JSON.parse(sharedBuild.loadout) as NavAlphaExportLoadout;
  } catch {
    return null;
  }

  const [variants, equipmentItems, omnipodItems] = await Promise.all([
    fetchNavAlphaMechsCatalog(refererUrl),
    fetchNavAlphaEquipmentCatalog(refererUrl),
    fetchNavAlphaOmnipodsCatalog(refererUrl),
  ]);

  const sharedVariantKey = normalizeLookupToken(sharedBuild.variant ?? "");
  const variant = variants.find((entry) => normalizeLookupToken(String(entry.name ?? "")) === sharedVariantKey);
  if (!variant?.id_code || !variant.faction) return null;

  let stockLoadout: NavAlphaExportLoadout = {};
  if (variant.stock_loadout) {
    try {
      stockLoadout = JSON.parse(variant.stock_loadout) as NavAlphaExportLoadout;
    } catch {
      stockLoadout = {};
    }
  }

  const mergedLoadout: NavAlphaExportLoadout = {
    ...stockLoadout,
    ...loadout,
    items: { ...(stockLoadout.items ?? {}), ...(loadout.items ?? {}) },
    armor: { ...(stockLoadout.armor ?? {}), ...(loadout.armor ?? {}) },
    omnipods: { ...(stockLoadout.omnipods ?? {}), ...(loadout.omnipods ?? {}) },
    actuators: { ...(stockLoadout.actuators ?? {}), ...(loadout.actuators ?? {}) },
    armor_type: loadout.armor_type ?? stockLoadout.armor_type ?? variant.armor_type,
    structure_type: loadout.structure_type ?? stockLoadout.structure_type ?? variant.structure_type,
    heatsink_type: loadout.heatsink_type ?? stockLoadout.heatsink_type ?? variant.heatsink_type,
    guidance_type: loadout.guidance_type ?? stockLoadout.guidance_type ?? variant.guidance_type,
  };

  const faction = String(variant.faction).toLowerCase() === "clan" ? "clan" : "inner_sphere";
  const omni = String(variant.omni ?? "0") === "1";
  const upgradeMap = NAV_ALPHA_UPGRADE_MAP[faction];
  const armorType = mergedLoadout.armor_type as keyof typeof upgradeMap.armor | undefined;
  const structureType = mergedLoadout.structure_type as keyof typeof upgradeMap.structure | undefined;
  const heatsinkType = mergedLoadout.heatsink_type as keyof typeof upgradeMap.heatsinks | undefined;
  const guidanceType = mergedLoadout.guidance_type as keyof typeof upgradeMap.guidance | undefined;
  if (!armorType || !structureType || !heatsinkType || !guidanceType) return null;

  const itemsById = new Map<number, NavAlphaEquipmentItem>();
  for (const item of equipmentItems) {
    const id = Number(item.id);
    if (Number.isFinite(id)) {
      itemsById.set(id, item);
    }
  }

  const omnipodsById = new Map<number, NavAlphaOmnipodItem>();
  for (const item of omnipodItems) {
    const id = Number(item.id);
    if (Number.isFinite(id)) {
      omnipodsById.set(id, item);
    }
  }

  let code = `A${variant.id_code}`;
  code += navAlphaDecTo64(upgradeMap.structure[structureType] + upgradeMap.armor[armorType]);
  code += navAlphaDecTo64(upgradeMap.heatsinks[heatsinkType] + upgradeMap.guidance[guidanceType] + (omni ? 8 : 0));
  if (omni) {
    const leftActuators = Math.max(0, Math.min(2, Number(mergedLoadout.actuators?.la ?? 0)));
    const rightActuators = Math.max(0, Math.min(2, Number(mergedLoadout.actuators?.ra ?? 0)));
    const actuatorCode = (2 - leftActuators) * 4 + (2 - rightActuators);
    code += navAlphaDecTo64(actuatorCode);
  } else {
    code += ":";
  }

  const componentOrder = ["hd", "la", "lt", "ct", "rt", "ra", "ll", "rl"] as const;
  const separators = ["p", "q", "r", "s", "t", "u", "v", "w"] as const;
  const itemsByComponent = mergedLoadout.items ?? {};
  const armorByComponent = mergedLoadout.armor ?? {};
  const omnipodsByComponent = mergedLoadout.omnipods ?? {};

  for (let index = 0; index < componentOrder.length; index += 1) {
    const component = componentOrder[index];
    code += navAlphaDecTo64(armorByComponent[component] ?? 0, 2);
    if (omni && component !== "ct") {
      const omnipodId = Number(omnipodsByComponent[component]);
      const omnipod = omnipodsById.get(omnipodId);
      if (!omnipod?.id_code) return null;
      code += omnipod.id_code;
    }
    if (!omni && component === "ct") {
      const centerTorsoItems = (itemsByComponent.ct ?? [])
        .map((id) => itemsById.get(Number(id)))
        .filter((item): item is NavAlphaEquipmentItem => Boolean(item));
      const engine = centerTorsoItems.find((item) => item.item_type === "engine");
      if (engine?.id_code) {
        code += `|${engine.id_code}`;
      }
      const heatSinks = centerTorsoItems.filter((item) => item.item_type === "heat_sink" && item.id_code);
      for (const heatSink of heatSinks) {
        code += `|${heatSink.id_code}`;
      }
    }

    for (const itemId of itemsByComponent[component] ?? []) {
      const item = itemsById.get(Number(itemId));
      if (!item?.id_code) continue;
      if (item.item_type === "internal") continue;
      if (item.fixed === true || item.fixed === 1 || item.fixed === "1") continue;
      if (!omni && component === "ct" && (item.item_type === "engine" || item.item_type === "heat_sink")) continue;
      code += `|${item.id_code}`;
    }
    code += separators[index];
  }

  for (const component of ["ct", "lt", "rt"] as const) {
    code += navAlphaDecTo64(armorByComponent[`${component}_rear`] ?? 0, 2);
  }

  return code.startsWith("A") ? code : null;
}

function loadMechsConfigCatalog(): MechsConfigCatalog {
  const candidates = [
    process.env.MECHS_CONFIG_PATH?.trim(),
    resolve(process.cwd(), "../app/public/mechs_config.json"),
    resolve(process.cwd(), "app/public/mechs_config.json"),
  ].filter((value): value is string => Boolean(value));

  let parsed: MechsConfigFile | undefined;
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8")) as MechsConfigFile;
      break;
    } catch {
      continue;
    }
  }

  const byCode: Record<string, CachedChassis> = {};
  const byVariant: Record<string, CachedChassis> = {};
  const techBuckets = parsed?.mechs ?? {};

  for (const [techKey, classBuckets] of Object.entries(techBuckets)) {
    const defaultTech: "IS" | "Clan" = techKey.toLowerCase() === "clan" ? "Clan" : "IS";
    for (const chassisEntries of Object.values(classBuckets)) {
      for (const [fallbackName, mech] of Object.entries(chassisEntries)) {
        const chassis = (mech.chassis_name ?? fallbackName).trim();
        const tonnage = typeof mech.tonnage === "number" ? mech.tonnage : 50;
        const variants = mech.variants ?? [];
        const explicitCode = (mech.chassis_code ?? "").trim().toUpperCase();

        const variantMap: Record<string, CachedVariant> = {};
        const inferredCodes = new Set<string>();
        for (const variant of variants) {
          const normalizedVariant = variant.trim().toUpperCase();
          if (!normalizedVariant) continue;
          byVariant[normalizedVariant] = {
            chassis,
            defaultTech,
            tonnage,
            variants: undefined,
          };

          const inferredCode = deriveCodeFromVariant(normalizedVariant);
          if (inferredCode) inferredCodes.add(inferredCode);

          const suffix = explicitCode && normalizedVariant.startsWith(`${explicitCode}-`)
            ? normalizedVariant.slice(explicitCode.length + 1)
            : normalizedVariant;
          variantMap[suffix] = { tech: defaultTech };
        }

        const codes = explicitCode ? [explicitCode] : [...inferredCodes];
        for (const code of codes) {
          if (!code) continue;
          if (!byCode[code]) {
            byCode[code] = {
              chassis,
              defaultTech,
              tonnage,
              variants: Object.keys(variantMap).length ? variantMap : undefined,
            };
          }
        }
      }
    }
  }

  return { byCode, byVariant };
}

const mechsConfigCatalog = loadMechsConfigCatalog();

function inferWeightClass(tonnage: number): WeightClass {
  if (tonnage <= 35) return "Light";
  if (tonnage <= 55) return "Medium";
  if (tonnage <= 75) return "Heavy";
  return "Assault";
}

function normalizeVariant(raw: string): string {
  return raw.trim().toUpperCase();
}

function normalizeLookupToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseVariantFromUrl(url: URL): string | null {
  const b = url.searchParams.get("b") ?? url.searchParams.get("build") ?? "";
  if (!b) return null;
  const trimmed = b.trim();
  if (!trimmed) return null;
  // NAV-Alpha commonly prefixes the build token as <hash>_<variant>.
  // Preserve underscore variants unless this prefix pattern is present.
  const hashPrefixed = trimmed.match(/^[0-9a-f]{6,}_(.+)$/i);
  const candidate = hashPrefixed?.[1] ?? trimmed;
  return normalizeVariant(candidate);
}

function parseBuildTokenFromUrl(url: URL): string | null {
  const b = url.searchParams.get("b") ?? url.searchParams.get("build") ?? "";
  const trimmed = b.trim();
  return trimmed ? trimmed : null;
}

function resolveChassisCodeFromVariant(variantCode: string): string {
  const normalizedVariantCode = normalizeLookupToken(variantCode);
  const knownCodes = Object.keys(mechsConfigCatalog.byCode)
    .slice()
    .sort((a, b) => b.length - a.length);

  for (const code of knownCodes) {
    const normalizedCode = normalizeLookupToken(code);
    if (normalizedVariantCode === normalizedCode || normalizedVariantCode.startsWith(normalizedCode)) {
      return code;
    }
  }

  return variantCode.split(/[-_]/)[0];
}

function parseWeaponsFromHtml(html: string): string[] {
  const lines = html
    .split(/\r?\n/)
    .filter((line) => /weapon|hardpoint|dps|alpha heat|heatsink|ammo/i.test(line));

  const result: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length >= 4) {
      result.push(cleaned);
    }
    if (result.length >= 20) break;
  }
  return result;
}

function extractExportCodeCandidates(text: string): string[] {
  const matches = text.match(MWO_EXPORT_CODE_REGEX) ?? [];
  return matches
    .map((value) => value.trim())
    .filter((value, idx, list) => value.length >= 20 && list.indexOf(value) === idx)
    .sort((a, b) => b.length - a.length);
}

function pickBestExportCode(candidates: string[]): string | null {
  if (!candidates.length) return null;
  return candidates[0] ?? null;
}

function sanitizeRenderedLine(rawLine: string): string {
  return rawLine
    .replace(/^\s*[*-]\s*/, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isIgnoredRenderedLine(line: string): boolean {
  if (!line || line.length < 3) return true;
  if (/^https?:\/\//i.test(line)) return true;
  if (/^[0-9+\-\sF]+$/.test(line)) return true;
  if (/^\d{2,3}\s+[A-Za-z]/.test(line)) return true;
  if (/^image\s+\d+$/i.test(line)) return true;
  if (/^title:\s|^url source:/i.test(line)) return true;
  if (/^markdown content:$/i.test(line)) return true;
  if (/^Built By:/i.test(line)) return true;

  const ignoredExact = new Set([
    "RIGHT ARM",
    "LEFT ARM",
    "RIGHT TORSO",
    "LEFT TORSO",
    "CENTER TORSO",
    "RIGHT LEG",
    "LEFT LEG",
    "HEAD",
    "Armor",
    "Structure",
    "Shoulder",
    "Upper Arm Actuator",
    "Lower Arm Actuator",
    "Hand Actuator",
    "Hip",
    "Upper Leg Actuator",
    "Lower Leg Actuator",
    "Foot Actuator",
    "Life Support",
    "Sensors",
    "Cockpit",
    "Gyro",
    "Built By: unFearing",
    "No Engine",
  ]);

  return ignoredExact.has(line);
}

function parseBuildFromRenderedText(renderedText: string): { weaponry: string; equipment: string[]; quirks: string[]; exportCode: string | null } | null {
  const weaponCounts = new Map<string, number>();
  const equipmentCounts = new Map<string, number>();
  const quirks: string[] = [];
  let heatSinksFromStats: number | null = null;
  let inQuirksSection = false;

  const weaponPattern = /(ac\/?\d+|uac|lbx|gauss|ppc|laser|flamer|machine gun|srm|lrm|atm|hag|rifle|narc|tag|snub)/i;
  const equipmentPattern = /(ammo|engine|heat\s*sink|probe|ecm|jump\s*jet|tcomp|targeting computer|sensor|masc|endo|ferro|stealth|dhs)/i;
  const splitTokensPattern = /\s{2,}|\s+(?=Armor|Structure|RIGHT|LEFT|CENTER|HEAD|Shoulder|Upper|Lower|Hand|Hip|Foot|Life|Sensors|Cockpit|Gyro|Clan XL Engine|XL Engine|Light Engine|Std Engine|Ammo|C-Double Heat Sink)/i;

  const addEquipment = (value: string) => {
    const normalizedEquipment = /^dhs$/i.test(value) ? "C-Double Heat Sink" : value;
    equipmentCounts.set(normalizedEquipment, (equipmentCounts.get(normalizedEquipment) ?? 0) + 1);
  };

  const addWeapon = (value: string) => {
    weaponCounts.set(value, (weaponCounts.get(value) ?? 0) + 1);
  };

  for (const rawLine of renderedText.split(/\r?\n/)) {
    const line = sanitizeRenderedLine(rawLine);
    if (isIgnoredRenderedLine(line)) continue;
    if (/^>/i.test(line)) continue;

    if (/^quirks?\b/i.test(line)) {
      inQuirksSection = true;
      continue;
    }

    // Quirks are useful to keep as metadata but should never pollute weapon/equipment parsing.
    if (inQuirksSection) {
      quirks.push(line);
      continue;
    }

    // Ignore stat modifier rows (commonly table rows from the quirks/stats sidebar).
    if (/\|/.test(line) && /[+-]\s*\d/.test(line)) {
      continue;
    }

    const heatSinkMatch = line.match(/heat\s*sinks?\s*:?\s*(\d{1,2})/i);
    if (heatSinkMatch) {
      const parsedCount = Number(heatSinkMatch[1]);
      if (Number.isFinite(parsedCount) && parsedCount > 0) {
        heatSinksFromStats = parsedCount;
      }
    }

    const tokens = line
      .split(splitTokensPattern)
      .map((token) => sanitizeRenderedLine(token))
      .filter(Boolean);

    let matchedToken = false;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (/^(Armor|Structure|RIGHT|LEFT|CENTER|HEAD|Shoulder|Upper|Lower|Hand|Hip|Foot|Life Support|Sensors|Cockpit|Gyro)$/i.test(token)) {
        continue;
      }

      const nextToken = tokens[index + 1] ?? "";
      if (weaponPattern.test(token) && /^ammo$/i.test(nextToken)) {
        addEquipment(`${token} Ammo`);
        matchedToken = true;
        index += 1;
        continue;
      }

      if (equipmentPattern.test(token)) {
        addEquipment(token);
        matchedToken = true;
        continue;
      }
      if (weaponPattern.test(token)) {
        addWeapon(token);
        matchedToken = true;
      }
    }

    if (matchedToken) {
      continue;
    }

    if (equipmentPattern.test(line)) {
      addEquipment(line);
      continue;
    }

    if (weaponPattern.test(line)) {
      addWeapon(line);
    }
  }

  const toLine = ([name, qty]: [string, number]) => (qty > 1 ? `${qty}x ${name}` : name);

  if (heatSinksFromStats !== null) {
    for (const equipmentName of Array.from(equipmentCounts.keys())) {
      if (/double\s*heat\s*sink/i.test(equipmentName) || /^dhs$/i.test(equipmentName)) {
        equipmentCounts.delete(equipmentName);
      }
    }
    equipmentCounts.set("C-Double Heat Sink", heatSinksFromStats);
  }

  const singletonEquipment = /(engine|probe|tcomp|targeting computer|ecm|masc|sensor)/i;
  for (const [name, qty] of equipmentCounts.entries()) {
    if (singletonEquipment.test(name) && qty > 1) {
      equipmentCounts.set(name, 1);
    }
  }
  const weaponLines = Array.from(weaponCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(toLine);
  const equipmentLines = Array.from(equipmentCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(toLine);
  const exportCode = pickBestExportCode(extractExportCodeCandidates(renderedText));

  if (!weaponLines.length && !equipmentLines.length) {
    return null;
  }

  return {
    weaponry: weaponLines.join(" | "),
    equipment: equipmentLines,
    quirks,
    exportCode,
  };
}

function visitJson(value: JsonValue, visitor: (obj: Record<string, JsonValue>) => void): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      visitJson(item, visitor);
    }
    return;
  }
  if (typeof value === "object") {
    visitor(value);
    for (const child of Object.values(value)) {
      visitJson(child, visitor);
    }
  }
}

function stringValue(value: JsonValue): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: JsonValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseBuildFromApiData(data: JsonValue): { weaponry: string; equipment: string[]; exportCode: string | null } | null {
  const weaponCounts = new Map<string, number>();
  const equipmentCounts = new Map<string, number>();
  const exportCodeCandidates: string[] = [];

  visitJson(data, (obj) => {
    const itemTypeRaw = stringValue(obj.item_type);
    const itemType = itemTypeRaw?.toLowerCase();
    const baseName =
      stringValue(obj.short_name) ??
      stringValue(obj.name) ??
      stringValue(obj.display_name) ??
      stringValue(obj.item) ??
      stringValue(obj.code);

    if (!baseName) return;

    const count = numberValue(obj.count) ?? numberValue(obj.qty) ?? numberValue(obj.quantity) ?? 1;
    const safeCount = Math.max(1, Math.floor(count));

    for (const value of Object.values(obj)) {
      const asString = stringValue(value);
      if (!asString) continue;
      const matches = extractExportCodeCandidates(asString);
      if (matches.length) {
        exportCodeCandidates.push(...matches);
      }
    }

    if (itemType === "weapon") {
      weaponCounts.set(baseName, (weaponCounts.get(baseName) ?? 0) + safeCount);
      return;
    }

    if (
      itemType === "ammo" ||
      itemType === "engine" ||
      itemType === "internal" ||
      itemType === "sensor" ||
      itemType === "targeting_computer" ||
      itemType === "masc" ||
      itemType === "misc" ||
      itemType === "jump_jet" ||
      itemType === "ecm" ||
      itemType === "heat_sink"
    ) {
      equipmentCounts.set(baseName, (equipmentCounts.get(baseName) ?? 0) + safeCount);
    }
  });

  const toLine = ([name, qty]: [string, number]) => (qty > 1 ? `${qty}x ${name}` : name);
  const weaponLines = Array.from(weaponCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(toLine);
  const equipmentLines = Array.from(equipmentCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(toLine);
  const exportCode = pickBestExportCode(exportCodeCandidates);

  if (!weaponLines.length && !equipmentLines.length) {
    return null;
  }

  return {
    weaponry: weaponLines.join(" | "),
    equipment: equipmentLines,
    exportCode,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "EXD8-BuildParser/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Source returned HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRenderedBuildText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const proxyUrl = `${RENDER_PROXY_BASE_URL}${url.replace(/^https?:\/\//i, "")}`;
    const response = await fetch(proxyUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "EXD8-BuildParser/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Rendered source returned HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBuildFromApi(buildToken: string, apiKey: string): Promise<JsonValue> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const endpoint = `${NAV_ALPHA_BUILD_API_URL}?token=${encodeURIComponent(buildToken)}`;
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "user-agent": "EXD8-BuildParser/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`NAV-Alpha API returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as NavAlphaApiResponse;
    if (!body.ok || !body.data) {
      throw new Error(body.message ?? "NAV-Alpha API returned no build data");
    }

    return body.data;
  } finally {
    clearTimeout(timeout);
  }
}

function makeDraftFromVariant(sourceUrl: string, variantCode: string, warnings: string[]): ParseBuildResponse {
  const variantUpper = variantCode.toUpperCase();
  const fromVariant =
    mechsConfigCatalog.byVariant[variantUpper] ??
    Object.entries(mechsConfigCatalog.byVariant).find(
      ([knownVariant]) => normalizeLookupToken(knownVariant) === normalizeLookupToken(variantCode),
    )?.[1];
  const chassisCode = resolveChassisCodeFromVariant(variantCode);
  const variantSuffixCandidates = Array.from(
    new Set(
      [
        variantCode.toUpperCase().startsWith(`${chassisCode.toUpperCase()}-`)
          ? variantCode.slice(chassisCode.length + 1)
          : variantCode.split("-").slice(1).join("-") || variantCode,
        variantCode.split("_").at(-1) ?? "",
        variantCode.split("_").slice(1).join("_") || "",
      ].filter(Boolean),
    ),
  );
  const catalog = fromVariant ?? mechsConfigCatalog.byCode[chassisCode];

  const chassis = catalog?.chassis ?? chassisCode;
  const variantInfo = catalog?.variants
    ? variantSuffixCandidates
        .map((suffix) =>
          Object.entries(catalog.variants ?? {}).find(
            ([variantSuffix]) => normalizeLookupToken(variantSuffix) === normalizeLookupToken(suffix),
          ),
        )
        .find((entry): entry is [string, CachedVariant] => Boolean(entry))?.[1]
    : undefined;
  const tonnage = catalog?.tonnage ?? 50;
  const tech = variantInfo?.tech ?? catalog?.defaultTech ?? "IS";
  const variantLabel = variantInfo?.label ? `${variantCode} (${variantInfo.label})` : variantCode;

  if (!catalog) {
    warnings.push(`No mechs_config chassis mapping found for code ${chassisCode}; using generic fallback values.`);
  }

  return {
    sourceUrl,
    warnings,
    metadata: {
      variantCode,
      chassisCode,
      cachedChassis: catalog?.chassis ?? null,
      cachedVariantLabel: variantInfo?.label ?? null,
      parseMode: "url-and-mechs-config",
    },
    draft: {
      class: inferWeightClass(tonnage),
      tech,
      tonnage,
      chassis,
      variant: variantLabel,
      link: sourceUrl,
      buildUrl: sourceUrl,
      skillCode: "pending",
      weaponry: "Parsed from link. Please review and update weapon details.",
      description: "Imported from NAV-Alpha build link.",
      role: tonnage >= 80 ? "Juggernaut" : tonnage >= 60 ? "Brawler" : "Skirmisher",
      buildCodes: {
        imported: variantCode,
      },
      metadata: {
        equipment: [],
        ranges: {
          optimal: 0,
          max: 0,
          idealMin: 0,
          idealMax: 0,
        },
        heat: {
          generation: 0,
          capacity: 0,
          dissipation: 0,
        },
        dps: {
          sustained: 0,
          max: 0,
        },
      },
      equipment: [],
      primaryRangeBracket: [0, 0],
      optimalRange: 0,
      maxRange: 0,
    },
  };
}

export async function parseMechBuildHandler(request: HttpRequest) {
  try {
    const payload = (await request.json()) as { url?: string };
    const urlValue = payload?.url?.trim();
    if (!urlValue) {
      return fail(400, "BAD_REQUEST", "url is required");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlValue);
    } catch {
      return fail(400, "BAD_REQUEST", "url must be a valid absolute URL");
    }

    const warnings: string[] = [];
    const variantCode = parseVariantFromUrl(parsedUrl);
    if (!variantCode) {
      return fail(400, "BAD_REQUEST", "Could not infer variant from URL query string");
    }
    const buildToken = parseBuildTokenFromUrl(parsedUrl);

    const result = makeDraftFromVariant(parsedUrl.toString(), variantCode, warnings);
    result.metadata.buildToken = buildToken;

    const navApiKey = process.env.NAV_ALPHA_API_KEY?.trim();

    if (buildToken) {
      try {
        const publicBuild = await fetchBuildFromPublicNavAlpha(buildToken, parsedUrl.toString());
        const publicExportCode = await computePublicNavAlphaExportCode(publicBuild, parsedUrl.toString());
        if (publicExportCode) {
          result.draft.buildCodes = {
            ...result.draft.buildCodes,
            export: publicExportCode,
          };
          result.metadata.extractedExportCode = true;
        }
      } catch (error: unknown) {
        warnings.push(
          error instanceof Error ? `Public NAV-Alpha build fetch failed: ${error.message}` : "Public NAV-Alpha build fetch failed",
        );
      }
    }

    try {
      const renderedText = await fetchRenderedBuildText(parsedUrl.toString());
      const parsed = parseBuildFromRenderedText(renderedText);
      if (parsed?.weaponry) {
        result.draft.weaponry = parsed.weaponry;
        result.metadata.extractedWeaponLines = parsed.weaponry.split("|").length;
        result.metadata.parseMode = "rendered-sidebar";
      }
      if (parsed?.equipment.length) {
        result.draft.metadata.equipment = parsed.equipment;
        result.draft.equipment = parsed.equipment;
        result.metadata.extractedEquipmentLines = parsed.equipment.length;
      }
      if (parsed?.quirks.length) {
        result.metadata.extractedQuirkLines = parsed.quirks.length;
      }
      if (parsed?.exportCode) {
        result.draft.buildCodes = {
          ...result.draft.buildCodes,
          export: parsed.exportCode,
        };
        result.metadata.extractedExportCode = true;
      }
    } catch (error: unknown) {
      warnings.push(
        error instanceof Error ? `Rendered scrape failed: ${error.message}` : "Rendered scrape failed"
      );
    }

    if ((!result.draft.weaponry || result.draft.weaponry.startsWith("Parsed from link")) && navApiKey && buildToken) {
      try {
        const apiData = await fetchBuildFromApi(buildToken, navApiKey);
        const parsed = parseBuildFromApiData(apiData);
        if (parsed?.weaponry) {
          result.draft.weaponry = parsed.weaponry;
          result.metadata.extractedWeaponLines = parsed.weaponry.split("|").length;
          result.metadata.parseMode = "nav-alpha-api";
        }
        if (parsed?.equipment.length) {
          result.draft.metadata.equipment = parsed.equipment;
          result.draft.equipment = parsed.equipment;
          result.metadata.extractedEquipmentLines = parsed.equipment.length;
        }
        if (parsed?.exportCode) {
          result.draft.buildCodes = {
            ...result.draft.buildCodes,
            export: parsed.exportCode,
          };
          result.metadata.extractedExportCode = true;
        }
        if (!parsed) {
          warnings.push("NAV-Alpha API returned build data but no recognizable weapon/equipment entries were found.");
        }
      } catch (error: unknown) {
        warnings.push(error instanceof Error ? `NAV-Alpha API parse failed: ${error.message}` : "NAV-Alpha API parse failed");
      }
    }

    if (!result.draft.weaponry || result.draft.weaponry.startsWith("Parsed from link")) {
      try {
        const html = await fetchHtml(parsedUrl.toString());
        const weaponLines = parseWeaponsFromHtml(html);
        const htmlExportCode = pickBestExportCode(extractExportCodeCandidates(html));
        if (weaponLines.length) {
          result.metadata.extractedWeaponLines = weaponLines.length;
          result.draft.weaponry = weaponLines.join(" | ");
          result.metadata.parseMode = "html-fallback";
        } else {
          warnings.push("Could not extract weapon list from page HTML. Fill weaponry manually.");
        }
        if (htmlExportCode) {
          result.draft.buildCodes = {
            ...result.draft.buildCodes,
            export: htmlExportCode,
          };
          result.metadata.extractedExportCode = true;
        }
      } catch (error: unknown) {
        warnings.push(error instanceof Error ? `HTML fetch failed: ${error.message}` : "HTML fetch failed");
      }
    }

    if (!result.draft.buildCodes.export) {
      warnings.push("Could not extract MWO export code from source data. If available, use the Export button in NAV-Alpha and paste it manually.");
    }

    return ok(result);
  } catch {
    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("mechParseBuild", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "mechs/parseBuild",
  handler: parseMechBuildHandler,
});
