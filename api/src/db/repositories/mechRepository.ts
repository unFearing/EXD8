import { randomUUID } from "node:crypto";
import type { CreateMechInput, MechDoc, WeightClass } from "../../types/contracts.js";
import { getMechsContainer } from "../cosmos.js";

export type VariantSummary = {
  variant: string;
  buildCount: number;
  builds: {
    id: string;
    markdown: string;
  }[];
};

export type ChassisSummary = {
  chassis: string;
  buildCount: number;
  variants: VariantSummary[];
};

export type WeightClassSummary = {
  class: WeightClass;
  buildCount: number;
  chassis: ChassisSummary[];
};

function toBuildMarkdown(doc: MechDoc): string {
  if (doc.markdown && doc.markdown.trim()) {
    return doc.markdown;
  }

  const metadata = doc.metadata ?? {
    equipment: doc.equipment ?? [],
    ranges: {
      optimal: doc.optimalRange ?? 0,
      max: doc.maxRange ?? 0,
      idealMin: doc.primaryRangeBracket?.[0] ?? 0,
      idealMax: doc.primaryRangeBracket?.[1] ?? 0,
    },
    heat: { generation: 0, capacity: 0, dissipation: 0 },
    dps: { sustained: 0, max: 0 },
  };

  const equipmentList = metadata.equipment ?? doc.equipment ?? [];
  const equipment = equipmentList.length
    ? equipmentList.map((item) => `- ${item}`).join("\n")
    : "- None listed";

  const buildCodes = Object.keys(doc.buildCodes).length
    ? Object.entries(doc.buildCodes)
        .map(([label, code]) => `- ${label}: \`${code}\``)
        .join("\n")
    : "- None listed";

  const rangeMin = metadata.ranges.idealMin ?? doc.primaryRangeBracket?.[0] ?? 0;
  const rangeMax = metadata.ranges.idealMax ?? doc.primaryRangeBracket?.[1] ?? 0;
  const optimalRange = metadata.ranges.optimal ?? doc.optimalRange ?? 0;
  const maxRange = metadata.ranges.max ?? doc.maxRange ?? 0;
  const tech = doc.tech ?? "Unknown";
  const tonnage = doc.tonnage ?? 0;
  const buildLink = doc.link || doc.buildUrl || "";
  const chassis = (doc.chassis ?? "").trim();
  const variant = (doc.variant ?? "").trim();
  const title =
    variant.toUpperCase().startsWith(`${chassis.toUpperCase()}-`) || variant.toUpperCase() === chassis.toUpperCase()
      ? variant
      : `${chassis}-${variant}`;

  return [
    `## ${title}`,
    "",
    doc.description || "No description provided.",
    "",
    `- Role: ${doc.role}`,
    `- Tech: ${tech}`,
    `- Tonnage: ${tonnage}`,
    `- Range: ${rangeMin}-${rangeMax}m (optimal ${optimalRange}m, max ${maxRange}m)`,
    "",
    "### Weaponry",
    doc.weaponry || "Not specified",
    "",
    "### Equipment",
    equipment,
    "",
    "### Build Codes",
    buildCodes,
    "",
    buildLink ? `### Build Link\n[Open Build](${buildLink})` : "### Build Link\nNot provided",
  ].join("\n");
}

function inferWeightClass(tonnage?: number): WeightClass {
  const value = tonnage ?? 0;
  if (value <= 35) return "Light";
  if (value <= 55) return "Medium";
  if (value <= 75) return "Heavy";
  return "Assault";
}

function canonicalizeBuildLink(raw?: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    url.hash = "";

    const token = (url.searchParams.get("b") ?? url.searchParams.get("build") ?? "").trim();
    if (token) {
      return `${url.origin}${url.pathname}?b=${token}`.toLowerCase();
    }

    const params = new URLSearchParams(url.searchParams);
    const sorted = Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const normalizedParams = new URLSearchParams(sorted);
    const query = normalizedParams.toString();
    return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function normalizeForHierarchy(doc: MechDoc): { className: WeightClass; chassisName: string; variantName: string } {
  const rawChassis = (doc.chassis ?? "").trim();
  const rawVariant = (doc.variant ?? "").trim();
  const upperChassis = rawChassis.toUpperCase();
  const upperVariant = rawVariant.toUpperCase();

  // Common NAV-Alpha imports may store ACH as Medium because fallback tonnage defaults to 50.
  if (upperChassis === "ACH" || upperVariant.startsWith("ACH-")) {
    return {
      className: "Light",
      chassisName: "ACH",
      variantName: rawVariant,
    };
  }

  // UM-IIC variants can be split as chassis "UM"; keep them grouped under Clan UrbanMech UM-IIC.
  if (upperVariant.startsWith("UM-IIC-") || upperChassis === "UM-IIC" || (upperChassis === "UM" && upperVariant.startsWith("UM-IIC-"))) {
    return {
      className: "Light",
      chassisName: "Clan UrbanMech UM-IIC",
      variantName: upperVariant === "UM-IIC-MTSP" ? "UM-IIC-M" : rawVariant,
    };
  }

  return {
    className: doc.class ?? inferWeightClass(doc.tonnage),
    chassisName: rawChassis,
    variantName: rawVariant,
  };
}

export async function createMech(input: CreateMechInput): Promise<MechDoc> {
  const candidateLink = canonicalizeBuildLink(input.link || input.buildUrl || "");
  if (candidateLink) {
    const existingDocs = await listMechs();
    const duplicate = existingDocs.find((doc) => {
      const docLink = canonicalizeBuildLink(doc.link || doc.buildUrl || "");
      return docLink && docLink === candidateLink;
    });
    if (duplicate) {
      throw new Error("DUPLICATE_BUILD_LINK");
    }
  }

  const tonnage = input.tonnage ?? 50;
  const primaryRange = input.primaryRangeBracket ?? [input.metadata.ranges.idealMin, input.metadata.ranges.idealMax];
  const doc: MechDoc = {
    ...input,
    codename: input.codename || `${input.chassis}-${input.variant}`,
    link: input.link || input.buildUrl || "",
    class: input.class ?? inferWeightClass(tonnage),
    tech: input.tech ?? "IS",
    tonnage,
    buildUrl: input.buildUrl || input.link || "",
    equipment: input.equipment ?? input.metadata.equipment,
    primaryRangeBracket: [primaryRange[0] ?? 0, primaryRange[1] ?? 0],
    optimalRange: input.optimalRange ?? input.metadata.ranges.optimal,
    maxRange: input.maxRange ?? input.metadata.ranges.max,
    id: randomUUID(),
    schemaVersion: "1.0",
    docType: "mech",
  };

  const container = getMechsContainer();
  await container.items.upsert(doc);
  return doc;
}

export async function getMechById(id: string): Promise<MechDoc | null> {
  const container = getMechsContainer();
  const { resources } = await container.items
    .query<MechDoc>({
      query: "SELECT * FROM c WHERE c.id = @id AND IS_DEFINED(c.chassis) AND IS_DEFINED(c.variant)",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();

  return resources[0] ?? null;
}

export async function deleteMechById(id: string): Promise<boolean> {
  const existing = await getMechById(id);
  if (!existing) {
    return false;
  }

  const container = getMechsContainer();
  await container.item(existing.id, existing.id).delete();
  return true;
}

export async function upsertMechWithId(id: string, input: CreateMechInput): Promise<MechDoc> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("INVALID_ID");
  }

  const tonnage = input.tonnage ?? 50;
  const primaryRange = input.primaryRangeBracket ?? [input.metadata.ranges.idealMin, input.metadata.ranges.idealMax];
  const doc: MechDoc = {
    ...input,
    codename: input.codename || `${input.chassis}-${input.variant}`,
    link: input.link || input.buildUrl || "",
    class: input.class ?? inferWeightClass(tonnage),
    tech: input.tech ?? "IS",
    tonnage,
    buildUrl: input.buildUrl || input.link || "",
    equipment: input.equipment ?? input.metadata.equipment,
    primaryRangeBracket: [primaryRange[0] ?? 0, primaryRange[1] ?? 0],
    optimalRange: input.optimalRange ?? input.metadata.ranges.optimal,
    maxRange: input.maxRange ?? input.metadata.ranges.max,
    id,
    schemaVersion: "1.0",
    docType: "mech",
  };

  const container = getMechsContainer();
  await container.items.upsert(doc);
  return doc;
}

export async function listMechs(): Promise<MechDoc[]> {
  const container = getMechsContainer();
  const { resources } = await container.items
    .query<MechDoc>({
      query: "SELECT * FROM c WHERE IS_DEFINED(c.chassis) AND IS_DEFINED(c.variant)",
    })
    .fetchAll();

  const byId = new Map<string, MechDoc>();
  for (const doc of resources) {
    const existing = byId.get(doc.id);
    if (!existing) {
      byId.set(doc.id, doc);
      continue;
    }

    const existingTs = existing._ts ?? 0;
    const nextTs = doc._ts ?? 0;
    if (nextTs >= existingTs) {
      byId.set(doc.id, doc);
    }
  }

  return Array.from(byId.values());
}

export async function getMechHierarchy(): Promise<WeightClassSummary[]> {
  const docs = await listMechs();
  const classes: WeightClass[] = ["Light", "Medium", "Heavy", "Assault"];

  return classes.map((weightClass) => {
    const classDocs = docs.filter((doc) => normalizeForHierarchy(doc).className === weightClass);
    const chassisMap = new Map<string, MechDoc[]>();

    for (const doc of classDocs) {
      const chassisName = normalizeForHierarchy(doc).chassisName;
      const bucket = chassisMap.get(chassisName) ?? [];
      bucket.push(doc);
      chassisMap.set(chassisName, bucket);
    }

    const chassis = Array.from(chassisMap.entries())
      .map(([chassisCode, chassisDocs]) => {
        const variantMap = new Map<string, MechDoc[]>();
        for (const doc of chassisDocs) {
          const variantName = normalizeForHierarchy(doc).variantName;
          const bucket = variantMap.get(variantName) ?? [];
          bucket.push(doc);
          variantMap.set(variantName, bucket);
        }

        const variants = Array.from(variantMap.entries())
          .map(([variant, variantDocs]) => ({
            variant,
            buildCount: variantDocs.length,
            builds: variantDocs
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((doc) => ({
                id: doc.id,
                markdown: toBuildMarkdown(doc),
              })),
          }))
          .sort((a, b) => a.variant.localeCompare(b.variant));

        return {
          chassis: chassisCode,
          buildCount: chassisDocs.length,
          variants,
        };
      })
      .sort((a, b) => a.chassis.localeCompare(b.chassis));

    return {
      class: weightClass,
      buildCount: classDocs.length,
      chassis,
    };
  });
}
