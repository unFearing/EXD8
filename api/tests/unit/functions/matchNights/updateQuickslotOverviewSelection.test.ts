import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateSelectionMock } = vi.hoisted(() => ({
  updateSelectionMock: vi.fn(),
}));

vi.mock("../../../../src/db/repositories/matchNightRepository.js", () => ({
  updateQuickslotOverviewSelection: updateSelectionMock,
}));

import { updateQuickslotOverviewSelectionHandler } from "../../../../src/functions/matchNights/updateQuickslotOverviewSelection.js";

const deckId = "550e8400-e29b-41d4-a716-446655440000";

function request(role: "TL" | "Pilot", payload: unknown) {
  return {
    json: async () => payload,
    headers: new Headers({
      "x-team-id": "EXD8",
      "x-user-id": "user-1",
      "x-user-role": role,
    }),
  } as never;
}

describe("updateQuickslotOverviewSelectionHandler", () => {
  beforeEach(() => {
    updateSelectionMock.mockReset();
  });

  it("persists a TL selection", async () => {
    updateSelectionMock.mockResolvedValueOnce({
      id: "quickslots-default",
      slots: [],
      overviewSelectedDeckIds: [deckId],
    });

    const response = await updateQuickslotOverviewSelectionHandler(
      request("TL", { overviewSelectedDeckIds: [deckId] }),
    );

    expect(response.status).toBe(200);
    expect(updateSelectionMock).toHaveBeenCalledWith(
      { overviewSelectedDeckIds: [deckId] },
      "user-1",
    );
  });

  it("rejects Pilot writes", async () => {
    const response = await updateQuickslotOverviewSelectionHandler(
      request("Pilot", { overviewSelectedDeckIds: [deckId] }),
    );

    expect(response.status).toBe(403);
    expect(updateSelectionMock).not.toHaveBeenCalled();
  });

  it.each([
    { overviewSelectedDeckIds: ["not-a-uuid"] },
    { overviewSelectedDeckIds: [deckId, deckId] },
  ])("rejects invalid selection payload %#", async (payload) => {
    const response = await updateQuickslotOverviewSelectionHandler(request("TL", payload));

    expect(response.status).toBe(400);
    expect(updateSelectionMock).not.toHaveBeenCalled();
  });
});
