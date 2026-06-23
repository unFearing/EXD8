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
  const equipment = doc.equipment.length
    ? doc.equipment.map((item) => `- ${item}`).join("\n")
    : "- None listed";

  const buildCodes = Object.keys(doc.buildCodes).length
    ? Object.entries(doc.buildCodes)
        .map(([label, code]) => `- ${label}: \`${code}\``)
        .join("\n")
    : "- None listed";

  return [
    `## ${doc.chassis}-${doc.variant}`,
    "",
    doc.description || "No description provided.",
    "",
    `- Role: ${doc.role}`,
    `- Tech: ${doc.tech}`,
    `- Tonnage: ${doc.tonnage}`,
    `- Range: ${doc.primaryRangeBracket[0]}-${doc.primaryRangeBracket[1]}m (optimal ${doc.optimalRange}m, max ${doc.maxRange}m)`,
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
    `### Build Link\n[Open Build](${doc.buildUrl})`,
  ].join("\n");
}

export async function createMech(input: CreateMechInput): Promise<MechDoc> {
  const doc: MechDoc = {
    ...input,
    id: randomUUID(),
    schemaVersion: "1.0.0",
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
      query: "SELECT * FROM c WHERE c.docType = @docType AND c.id = @id",
      parameters: [
        { name: "@docType", value: "mech" },
        { name: "@id", value: id },
      ],
    })
    .fetchAll();

  return resources[0] ?? null;
}

export async function upsertMechWithId(id: string, input: CreateMechInput): Promise<MechDoc> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("INVALID_ID");
  }

  const doc: MechDoc = {
    ...input,
    id,
    schemaVersion: "1.0.0",
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
      query: "SELECT * FROM c WHERE c.docType = @docType",
      parameters: [{ name: "@docType", value: "mech" }],
    })
    .fetchAll();

  return resources;
}

export async function getMechHierarchy(): Promise<WeightClassSummary[]> {
  const docs = await listMechs();
  const classes: WeightClass[] = ["Light", "Medium", "Heavy", "Assault"];

  return classes.map((weightClass) => {
    const classDocs = docs.filter((doc) => doc.class === weightClass);
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
