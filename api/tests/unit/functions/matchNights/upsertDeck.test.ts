import { describe, expect, it, vi } from "vitest";

const { upsertDropDeckMock } = vi.hoisted(() => ({
  upsertDropDeckMock: vi.fn(),
}));

vi.mock("../../../../src/db/repositories/matchNightRepository.js", () => ({
  upsertDropDeck: upsertDropDeckMock,
}));

import { upsertDropDeckHandler } from "../../../../src/functions/matchNights/upsertDeck.js";

function validPayload() {
  return {
    map: "River City",
    side: "either",
    name: "River opener",
    description: "Push mid after scout check.",
    deck: [
      {
        slot: 1,
        primary: ["Xiphias"],
        alternates: [],
        lance: "A",
        mech: "550e8400-e29b-41d4-a716-446655440000",
      },
    ],
  };
}

describe("upsertDropDeckHandler", () => {
  it("returns 200 for valid input", async () => {
    upsertDropDeckMock.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440001" });

    const response = await upsertDropDeckHandler({
      json: async () => validPayload(),
      headers: new Headers({
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(200);
  });

  it("returns 400 for invalid schema", async () => {
    const response = await upsertDropDeckHandler({
      json: async () => ({ map: "River City" }),
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(400);
  });

  it("returns 409 for write conflict", async () => {
    const error = new Error("WRITE_CONFLICT") as Error & { details?: unknown };
    error.details = { conflictPaths: ["description"] };
    upsertDropDeckMock.mockRejectedValueOnce(error);

    const response = await upsertDropDeckHandler({
      json: async () => validPayload(),
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(409);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("WRITE_CONFLICT");
  });
});
