import { describe, expect, it, vi } from "vitest";

const { listDropDecksMock } = vi.hoisted(() => ({
  listDropDecksMock: vi.fn(),
}));

vi.mock("../../../../src/db/repositories/matchNightRepository.js", () => ({
  listDropDecks: listDropDecksMock,
}));

import { listDropDecksHandler } from "../../../../src/functions/matchNights/listDecks.js";

describe("listDropDecksHandler", () => {
  it("returns 200 when auth headers are missing", async () => {
    listDropDecksMock.mockResolvedValueOnce([]);

    const response = await listDropDecksHandler({
      query: new URLSearchParams(),
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(200);
  });

  it("returns 200 with drop decks", async () => {
    listDropDecksMock.mockResolvedValueOnce([
      {
        id: "f22063d0-ccf2-4c8f-b378-d84b68fd77fd",
        teamId: "exd8",
        map: "River City",
        side: "Either",
        name: "River opener",
      },
    ]);

    const response = await listDropDecksHandler({
      query: new URLSearchParams(),
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(200);
  });
});
