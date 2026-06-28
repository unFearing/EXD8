import { app, type HttpRequest } from "@azure/functions";
import { fail, ok } from "../../middleware/http.js";
import { navAlphaChassisCatalog } from "../../data/navAlphaChassisCatalog.js";
import type { CreateMechInput, WeightClass } from "../../types/contracts.js";

type ParseBuildResponse = {
  sourceUrl: string;
  warnings: string[];
  metadata: Record<string, string | number | boolean | null>;
  draft: CreateMechInput;
};

const REQUEST_TIMEOUT_MS = 7000;
const NAV_ALPHA_BUILD_API_URL = "https://mwo.nav-alpha.com/api/build/";
const RENDER_PROXY_BASE_URL = "https://r.jina.ai/http://";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type NavAlphaApiResponse = {
  ok?: boolean;
  data?: JsonValue;
  message?: string;
};

function inferWeightClass(tonnage: number): WeightClass {
  if (tonnage <= 35) return "Light";
  if (tonnage <= 55) return "Medium";
  if (tonnage <= 75) return "Heavy";
  return "Assault";
}

function normalizeVariant(raw: string): string {
  return raw.trim().toUpperCase();
}

function parseVariantFromUrl(url: URL): string | null {
  const b = url.searchParams.get("b") ?? url.searchParams.get("build") ?? "";
  if (!b) return null;
  const candidate = b.includes("_") ? b.split("_").at(-1) : b;
  if (!candidate) return null;
  return normalizeVariant(candidate);
}

function parseBuildTokenFromUrl(url: URL): string | null {
  const b = url.searchParams.get("b") ?? url.searchParams.get("build") ?? "";
  const trimmed = b.trim();
  return trimmed ? trimmed : null;
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

function parseBuildFromRenderedText(renderedText: string): { weaponry: string; equipment: string[] } | null {
  const weaponCounts = new Map<string, number>();
  const equipmentCounts = new Map<string, number>();
  let heatSinksFromStats: number | null = null;

  const weaponPattern = /(ac\/?\d+|uac|lbx|gauss|ppc|laser|flamer|machine gun|srm|lrm|atm|hag|rifle|narc|tag|snub)/i;
  const equipmentPattern = /(ammo|engine|heat\s*sink|probe|ecm|jump\s*jet|tcomp|targeting computer|sensor|masc|endo|ferro|stealth|dhs)/i;

  for (const rawLine of renderedText.split(/\r?\n/)) {
    const line = sanitizeRenderedLine(rawLine);
    if (isIgnoredRenderedLine(line)) continue;
    if (/^>/i.test(line)) continue;

    const heatSinkMatch = line.match(/heat\s*sinks?\s*:?\s*(\d{1,2})/i);
    if (heatSinkMatch) {
      const parsedCount = Number(heatSinkMatch[1]);
      if (Number.isFinite(parsedCount) && parsedCount > 0) {
        heatSinksFromStats = parsedCount;
      }
    }

    if (equipmentPattern.test(line)) {
      const normalizedEquipment = /^dhs$/i.test(line) ? "C-Double Heat Sink" : line;
      equipmentCounts.set(normalizedEquipment, (equipmentCounts.get(normalizedEquipment) ?? 0) + 1);
      continue;
    }

    if (weaponPattern.test(line)) {
      weaponCounts.set(line, (weaponCounts.get(line) ?? 0) + 1);
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

  if (!weaponLines.length && !equipmentLines.length) {
    return null;
  }

  return {
    weaponry: weaponLines.join(" | "),
    equipment: equipmentLines,
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

function parseBuildFromApiData(data: JsonValue): { weaponry: string; equipment: string[] } | null {
  const weaponCounts = new Map<string, number>();
  const equipmentCounts = new Map<string, number>();

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

  if (!weaponLines.length && !equipmentLines.length) {
    return null;
  }

  return {
    weaponry: weaponLines.join(" | "),
    equipment: equipmentLines,
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
  const chassisCode = variantCode.split("-")[0];
  const variantSuffix = variantCode.split("-").slice(1).join("-") || variantCode;
  const catalog = navAlphaChassisCatalog[chassisCode];

  const chassis = catalog?.chassis ?? chassisCode;
  const variantInfo = catalog?.variants?.[variantSuffix];
  const tonnage = catalog?.tonnage ?? 50;
  const tech = variantInfo?.tech ?? catalog?.defaultTech ?? "IS";
  const variantLabel = variantInfo?.label ? `${variantCode} (${variantInfo.label})` : variantCode;

  if (!catalog) {
    warnings.push(`No cached chassis mapping found for code ${chassisCode}; using fallback values.`);
  }

  return {
    sourceUrl,
    warnings,
    metadata: {
      variantCode,
      chassisCode,
      cachedChassis: catalog?.chassis ?? null,
      cachedVariantLabel: variantInfo?.label ?? null,
      parseMode: "url-and-cache",
    },
    draft: {
      class: inferWeightClass(tonnage),
      tech,
      tonnage,
      chassis,
      variant: variantLabel,
      codename: `${chassis}-${variantLabel}`,
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
        if (weaponLines.length) {
          result.metadata.extractedWeaponLines = weaponLines.length;
          result.draft.weaponry = weaponLines.join(" | ");
          result.metadata.parseMode = "html-fallback";
        } else {
          warnings.push("Could not extract weapon list from page HTML. Fill weaponry manually.");
        }
      } catch (error: unknown) {
        warnings.push(error instanceof Error ? `HTML fetch failed: ${error.message}` : "HTML fetch failed");
      }
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
