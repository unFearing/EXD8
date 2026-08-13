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
