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

  return [
    `## ${doc.chassis}-${doc.variant}`,
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

export async function createMech(input: CreateMechInput): Promise<MechDoc> {
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

  return resources;
}

export async function getMechHierarchy(): Promise<WeightClassSummary[]> {
  const docs = await listMechs();
  const classes: WeightClass[] = ["Light", "Medium", "Heavy", "Assault"];

  return classes.map((weightClass) => {
    const classDocs = docs.filter((doc) => (doc.class ?? inferWeightClass(doc.tonnage)) === weightClass);
    const chassisMap = new Map<string, MechDoc[]>();

    for (const doc of classDocs) {
      const bucket = chassisMap.get(doc.chassis) ?? [];
      bucket.push(doc);
      chassisMap.set(doc.chassis, bucket);
    }

    const chassis = Array.from(chassisMap.entries())
      .map(([chassisCode, chassisDocs]) => {
        const variantMap = new Map<string, MechDoc[]>();
        for (const doc of chassisDocs) {
          const bucket = variantMap.get(doc.variant) ?? [];
          bucket.push(doc);
          variantMap.set(doc.variant, bucket);
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
