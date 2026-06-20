import { randomUUID } from "node:crypto";
import type { CreateMechInput, MechDoc } from "../../types/contracts.js";
import { getMechsContainer } from "../cosmos.js";

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