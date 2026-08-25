import { describe, expect, it, vi } from "vitest";

const { upsertQuickslotMock } = vi.hoisted(() => ({
  upsertQuickslotMock: vi.fn(),
}));

vi.mock("../../../../src/db/repositories/matchNightRepository.js", () => ({
  upsertQuickslot: upsertQuickslotMock,
}));

import { upsertQuickslotsHandler } from "../../../../src/functions/matchNights/upsertQuickslots.js";

describe("upsertQuickslotsHandler", () => {
  it("allows a Pilot to persist deck quickslots", async () => {
    upsertQuickslotMock.mockResolvedValueOnce({ id: "quickslots-default" });

    const response = await upsertQuickslotsHandler({
      json: async () => ({
        id: "quickslots-default",
        slots: [{ map: "River City", slot: "A", deckId: "deck-1" }],
      }),
      headers: new Headers({
        "x-team-id": "EXD8",
        "x-user-id": "pilot-1",
        "x-user-name": "Pilot",
        "x-user-role": "Pilot",
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(upsertQuickslotMock).toHaveBeenCalledWith(expect.any(Object), "Pilot");
  });
});
