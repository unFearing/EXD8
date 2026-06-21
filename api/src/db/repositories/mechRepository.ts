import { randomUUID } from "node:crypto";
import type { CreateMechInput, MechDoc, WeightClass } from "../../types/contracts.js";
import { getMechsContainer } from "../cosmos.js";

export type VariantSummary = {
  variant: string;
  buildCount: number;
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
        const variantMap = new Map<string, number>();
        for (const doc of chassisDocs) {
          variantMap.set(doc.variant, (variantMap.get(doc.variant) ?? 0) + 1);
        }

        const variants = Array.from(variantMap.entries())
          .map(([variant, buildCount]) => ({ variant, buildCount }))
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