import { randomUUID } from "node:crypto";
import type {
  DropDeckDoc,
  DropDeckUpsertInput,
  MatchNightCreateInput,
  MatchNightDoc,
  QuickslotDoc,
  QuickslotUpsertInput,
} from "../../types/contracts.js";
import { getMatchNightsContainer } from "../cosmos.js";

type DropDeckEditable = Pick<DropDeckDoc, "map" | "side" | "name" | "description" | "deck">;
const DROP_DECK_COMP = "CS26" as const;
const MIN_FILLED_SLOTS_TO_SAVE = 5;

type DeckMergeResult = {
  merged: DropDeckEditable;
  conflictPaths: string[];
};

function cloneEditable(value: DropDeckEditable): DropDeckEditable {
  return {
    map: value.map,
    side: value.side,
    name: value.name,
    description: value.description,
    deck: value.deck.map((slot) => ({
      slot: slot.slot,
      primary: [...slot.primary],
      alternates: [...slot.alternates],
      lance: slot.lance,
      mech: slot.mech,
      chassis: slot.chassis ?? "",
      variant: slot.variant ?? "",
      weaponry: slot.weaponry ?? "",
      equipmentText: slot.equipmentText ?? "",
      codename: slot.codename ?? "",
      buildUrl: slot.buildUrl ?? "",
      role: slot.role ?? "",
      skillTree: slot.skillTree ?? "",
    })),
  };
}

function hasChanged(base: unknown, value: unknown): boolean {
  return JSON.stringify(base) !== JSON.stringify(value);
}

function countFilledDeckSlots(deck: DropDeckEditable["deck"]): number {
  return deck.reduce((count, slot) => {
    const hasMechId = Boolean((slot.mech ?? "").trim());
    const hasChassis = Boolean((slot.chassis ?? "").trim());
    return count + (hasMechId || hasChassis ? 1 : 0);
  }, 0);
}

function mergeEditable(
  base: DropDeckEditable,
  current: DropDeckEditable,
  incoming: DropDeckEditable,
): DeckMergeResult {
  const merged = cloneEditable(current);
  const conflictPaths: string[] = [];

  const scalarKeys: Array<keyof Omit<DropDeckEditable, "deck">> = ["map", "side", "name", "description"];
  for (const key of scalarKeys) {
    const incomingChanged = hasChanged(base[key], incoming[key]);
    if (!incomingChanged) continue;

    const currentChanged = hasChanged(base[key], current[key]);
    if (currentChanged && hasChanged(current[key], incoming[key])) {
      conflictPaths.push(String(key));
      continue;
    }

    switch (key) {
      case "map":
        merged.map = incoming.map;
        break;
      case "side":
        merged.side = incoming.side;
        break;
      case "name":
        merged.name = incoming.name;
        break;
      case "description":
        merged.description = incoming.description;
        break;
    }
  }

  const slotIndex = new Map<number, { base?: DropDeckEditable["deck"][number]; current?: DropDeckEditable["deck"][number]; incoming?: DropDeckEditable["deck"][number] }>();
  for (const slot of base.deck) slotIndex.set(slot.slot, { ...slotIndex.get(slot.slot), base: slot });
  for (const slot of current.deck) slotIndex.set(slot.slot, { ...slotIndex.get(slot.slot), current: slot });
  for (const slot of incoming.deck) slotIndex.set(slot.slot, { ...slotIndex.get(slot.slot), incoming: slot });

  const mergedDeck = [...current.deck];
  const mergedDeckLookup = new Map<number, number>(mergedDeck.map((slot, idx) => [slot.slot, idx]));

  const slotFields: Array<keyof Omit<DropDeckEditable["deck"][number], "slot">> = [
    "primary",
    "alternates",
    "lance",
    "mech",
    "chassis",
    "variant",
    "weaponry",
    "equipmentText",
    "codename",
    "buildUrl",
    "role",
    "skillTree",
  ];

  for (const [slotNumber, value] of slotIndex.entries()) {
    const baseSlot = value.base ?? {
      slot: slotNumber,
      primary: [],
      alternates: [],
      lance: "",
      mech: "",
      chassis: "",
      variant: "",
      weaponry: "",
      equipmentText: "",
      codename: "",
      buildUrl: "",
      role: "",
      skillTree: "",
    };
    const currentSlot = value.current ?? baseSlot;
    const incomingSlot = value.incoming ?? baseSlot;

    const idx = mergedDeckLookup.get(slotNumber);
    const targetSlot = idx === undefined ? { ...currentSlot } : { ...mergedDeck[idx] };

    for (const field of slotFields) {
      const incomingChanged = hasChanged(baseSlot[field], incomingSlot[field]);
      if (!incomingChanged) continue;

      const currentChanged = hasChanged(baseSlot[field], currentSlot[field]);
      if (currentChanged && hasChanged(currentSlot[field], incomingSlot[field])) {
        conflictPaths.push(`deck[${slotNumber}].${String(field)}`);
        continue;
      }

      targetSlot[field] = incomingSlot[field] as never;
    }

    if (idx === undefined) {
      mergedDeck.push(targetSlot);
      mergedDeckLookup.set(slotNumber, mergedDeck.length - 1);
    } else {
      mergedDeck[idx] = targetSlot;
    }
  }

  merged.deck = mergedDeck.sort((a, b) => a.slot - b.slot);

  return {
    merged,
    conflictPaths,
  };
}

export async function createMatchNight(input: MatchNightCreateInput, updatedBy: string): Promise<MatchNightDoc> {
  const now = new Date().toISOString();
  const id = `match-${input.date}-${Math.random().toString(16).slice(2, 8)}`;
  const comp = `${input.teamId}:${input.seasonId}`;
  const doc: MatchNightDoc = {
    ...input,
    id,
    comp,
    updatedAt: now,
    updatedBy,
    schemaVersion: "1.0.0",
    docType: "matchNight",
  };

  const container = getMatchNightsContainer();
  await container.items.upsert(doc);
  return doc;
}

export async function getMatchNightById(id: string, teamId: string): Promise<MatchNightDoc | null> {
  const container = getMatchNightsContainer();
  const { resources } = await container.items
    .query<MatchNightDoc>({
      query: "SELECT * FROM c WHERE c.docType = @docType AND c.id = @id AND c.teamId = @teamId",
      parameters: [
        { name: "@docType", value: "matchNight" },
        { name: "@id", value: id },
        { name: "@teamId", value: teamId },
      ],
    })
    .fetchAll();

  return resources[0] ?? null;
}

export async function listDropDecks(): Promise<DropDeckDoc[]> {
  const container = getMatchNightsContainer();
  const { resources } = await container.items
    .query<DropDeckDoc>({
      query: "SELECT * FROM c WHERE c.docType = @docType AND c.comp = @comp ORDER BY c.updatedAt DESC",
      parameters: [
        { name: "@docType", value: "dropDeck" },
        { name: "@comp", value: DROP_DECK_COMP },
      ],
    })
    .fetchAll();

  return resources;
}

export async function getDropDeckById(id: string): Promise<DropDeckDoc | null> {
  const container = getMatchNightsContainer();
  const { resources } = await container.items
    .query<DropDeckDoc>({
      query: "SELECT * FROM c WHERE c.id = @id AND c.docType = @docType AND c.comp = @comp",
      parameters: [
        { name: "@id", value: id },
        { name: "@docType", value: "dropDeck" },
        { name: "@comp", value: DROP_DECK_COMP },
      ],
    })
    .fetchAll();

  return resources[0] ?? null;
}

export async function upsertDropDeck(input: DropDeckUpsertInput, updatedBy: string): Promise<DropDeckDoc> {
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  const existing = input.id ? await getDropDeckById(input.id) : null;

  const incomingEditable: DropDeckEditable = {
    map: input.map,
    side: input.side,
    name: input.name,
    description: input.description,
    deck: input.deck,
  };

  if (countFilledDeckSlots(incomingEditable.deck) < MIN_FILLED_SLOTS_TO_SAVE) {
    const error = new Error("MIN_FILLED_SLOTS");
    throw error;
  }

  let editable: DropDeckEditable = incomingEditable;
  let nextRevision = existing?.revision ?? 0;
  const existingDescription = (existing as (DropDeckDoc & { strategy?: string }) | null)?.description
    ?? (existing as (DropDeckDoc & { strategy?: string }) | null)?.strategy
    ?? "";

  if (existing) {
    if (input.baseRevision === undefined || !input.baseDeck) {
      const error = new Error("MISSING_BASE_CONTEXT");
      throw error;
    }

    if (input.baseRevision !== existing.revision) {
      const merged = mergeEditable(input.baseDeck, {
        map: existing.map,
        side: existing.side,
        name: existing.name,
        description: existingDescription,
        deck: existing.deck,
      }, incomingEditable);

      if (merged.conflictPaths.length) {
        const error = new Error("WRITE_CONFLICT");
        (error as Error & { details?: unknown }).details = {
          conflictPaths: merged.conflictPaths,
          latest: existing,
        };
        throw error;
      }

      editable = merged.merged;
    }

    nextRevision = existing.revision;
  }

  const doc: DropDeckDoc = {
    id,
    comp: DROP_DECK_COMP,
    map: editable.map,
    side: editable.side,
    name: editable.name,
    description: editable.description,
    deck: editable.deck,
    revision: nextRevision + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    updatedBy,
    schemaVersion: "1.0.0",
    docType: "dropDeck",
  };

  const container = getMatchNightsContainer();
  await container.items.upsert(doc);
  return doc;
}

export async function deleteDropDeckById(id: string): Promise<boolean> {
  const existing = await getDropDeckById(id);
  if (!existing) {
    return false;
  }

  const container = getMatchNightsContainer();
  const raw = existing as DropDeckDoc & { teamId?: string };
  const partitionCandidates: Array<string | undefined> = [
    raw.comp,
    raw.id,
    raw.docType,
    raw.teamId,
    raw.map,
    raw.side,
    raw.name,
    undefined,
  ];
  const attempted = new Set<string>();
  let lastError: unknown = null;

  for (const candidate of partitionCandidates) {
    const key = candidate ?? "__undefined__";
    if (attempted.has(key)) continue;
    attempted.add(key);

    try {
      await container.item(raw.id, candidate as never).delete();
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("DELETE_FAILED");
}

export async function getQuickslotById(id: string): Promise<QuickslotDoc | null> {
  const container = getMatchNightsContainer();
  const { resources } = await container.items
    .query<QuickslotDoc>({
      query: "SELECT * FROM c WHERE c.id = @id AND c.docType = @docType",
      parameters: [
        { name: "@id", value: id },
        { name: "@docType", value: "quickslot" },
      ],
    })
    .fetchAll();

  return resources[0] ?? null;
}

export async function upsertQuickslot(input: QuickslotUpsertInput, updatedBy: string): Promise<QuickslotDoc> {
  const now = new Date().toISOString();
  const id = input.id ?? "quickslots-default";
  const doc: QuickslotDoc = {
    id,
    slots: input.slots,
    updatedAt: now,
    updatedBy,
    schemaVersion: "1.0.0",
    docType: "quickslot",
  };

  const container = getMatchNightsContainer();
  await container.items.upsert(doc);
  return doc;
}
