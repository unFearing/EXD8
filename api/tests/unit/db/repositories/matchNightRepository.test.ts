import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAllMock, queryMock, upsertMock } = vi.hoisted(() => {
  const fetchAll = vi.fn();
  return {
    fetchAllMock: fetchAll,
    queryMock: vi.fn(() => ({ fetchAll })),
    upsertMock: vi.fn(),
  };
});

vi.mock("../../../../src/db/cosmos.js", () => ({
  getMatchNightsContainer: () => ({
    items: {
      query: queryMock,
      upsert: upsertMock,
    },
  }),
}));

import {
  updateQuickslotOverviewSelection,
  upsertDropDeck,
  upsertQuickslot,
} from "../../../../src/db/repositories/matchNightRepository.js";

const deckId = "550e8400-e29b-41d4-a716-446655440000";
const existing = {
  id: "quickslots-default",
  slots: [{ map: "River City", slot: "A" as const, deckId }],
  overviewSelectedDeckIds: [deckId],
  updatedAt: "2026-08-12T00:00:00.000Z",
  updatedBy: "TL",
  schemaVersion: "1.0.0" as const,
  docType: "quickslot" as const,
};

describe("quickslot repository updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAllMock.mockResolvedValue({ resources: [existing] });
    upsertMock.mockImplementation(async (value) => ({ resource: value }));
  });

  it("preserves Overview selection when quickslot assignments change", async () => {
    const result = await upsertQuickslot({
      slots: [{ map: "River City", slot: "B", deckId }],
    }, "TL");

    expect(result.overviewSelectedDeckIds).toEqual([deckId]);
    expect(result.slots[0]?.slot).toBe("B");
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      overviewSelectedDeckIds: [deckId],
    }));
  });

  it("preserves quickslot assignments when Overview selection changes", async () => {
    const result = await updateQuickslotOverviewSelection({
      overviewSelectedDeckIds: [],
    }, "TL");

    expect(result.slots).toEqual(existing.slots);
    expect(result.overviewSelectedDeckIds).toEqual([]);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      slots: existing.slots,
      overviewSelectedDeckIds: [],
    }));
  });

  it("creates a backward-compatible document when no quickslot exists", async () => {
    fetchAllMock.mockResolvedValueOnce({ resources: [] });

    const result = await updateQuickslotOverviewSelection({
      overviewSelectedDeckIds: [deckId],
    }, "TL");

    expect(result.slots).toEqual([]);
    expect(result.overviewSelectedDeckIds).toEqual([deckId]);
  });
});

function deckRows(tonnage: number) {
  return Array.from({ length: 5 }, (_, index) => ({
    slot: index + 1,
    primary: [],
    alternates: [],
    lance: "" as const,
    mech: `legacy-mech-${index + 1}`,
    chassis: "",
    variant: "",
    weaponry: "",
    equipmentText: "",
    buildUrl: "",
    buildCode: "",
    role: "",
    skillTree: "",
    tonnage,
  }));
}

describe("drop deck legacy tonnage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockImplementation(async (value) => ({ resource: value }));
  });

  it("persists row tonnage on a new deck", async () => {
    const result = await upsertDropDeck({
      map: "River City",
      side: "either",
      name: "Legacy deck",
      description: "",
      initial: "Scout the river crossing.",
      ideal: "Collapse on the isolated target.",
      deck: deckRows(20),
    }, "TL");

    expect(result.deck[0]?.tonnage).toBe(20);
    expect(result.initial).toBe("Scout the river crossing.");
    expect(result.ideal).toBe("Collapse on the isolated target.");
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      initial: "Scout the river crossing.",
      ideal: "Collapse on the isolated target.",
      deck: expect.arrayContaining([expect.objectContaining({ slot: 1, tonnage: 20 })]),
    }));
  });

  it("preserves unchanged row tonnage during a stale-revision merge", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440010";
    const baseDeck = {
      map: "River City" as const,
      side: "either" as const,
      name: "Legacy deck",
      description: "Before",
      initial: "Initial setup",
      ideal: "Ideal setup",
      deck: deckRows(20),
    };
    fetchAllMock.mockResolvedValueOnce({
      resources: [{
        ...baseDeck,
        id,
        description: "Before",
        revision: 2,
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        updatedBy: "Other TL",
        schemaVersion: "1.0.0",
        docType: "dropDeck",
      }],
    });

    const result = await upsertDropDeck({
      id,
      baseRevision: 1,
      baseDeck,
      ...baseDeck,
      description: "After",
    }, "TL");

    expect(result.description).toBe("After");
    expect(result.deck[0]?.tonnage).toBe(20);
  });

  it("merges independent Initial and Ideal edits during a stale revision", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440010";
    const baseDeck = {
      map: "River City" as const,
      side: "either" as const,
      name: "Strategy deck",
      description: "Hold center",
      initial: "Scout left",
      ideal: "Collapse center",
      deck: deckRows(20),
    };
    fetchAllMock.mockResolvedValueOnce({
      resources: [{
        ...baseDeck,
        id,
        initial: "Scout right",
        revision: 2,
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        updatedBy: "Other TL",
        schemaVersion: "1.0.0",
        docType: "dropDeck",
      }],
    });

    const result = await upsertDropDeck({
      id,
      baseRevision: 1,
      baseDeck,
      ...baseDeck,
      ideal: "Collapse right",
    }, "TL");

    expect(result.initial).toBe("Scout right");
    expect(result.ideal).toBe("Collapse right");
  });
});
