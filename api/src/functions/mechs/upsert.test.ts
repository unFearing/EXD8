import { describe, expect, it, vi } from "vitest";

const { upsertMechWithIdMock } = vi.hoisted(() => ({
  upsertMechWithIdMock: vi.fn(),
}));

vi.mock("../../db/repositories/mechRepository.js", () => ({
  upsertMechWithId: upsertMechWithIdMock,
}));

import { upsertMechHandler } from "./upsert.js";

function validPayload() {
  return {
    chassis: "TIMB",
    variant: "S",
    codename: "TIMB-S",
    link: "https://example.com/builds/timberwolf-s",
    buildUrl: "https://example.com/builds/timberwolf-s",
    skillCode: "a1b2c3",
    weaponry: "2x ERPPC, 4x ERML",
    description: "Long-range poke with mobile follow-up pressure.",
    role: "Sniper",
    buildCodes: {
      stock: "ABC123",
      premium: "DEF456",
    },
    metadata: {
      equipment: ["ECM", "Targeting Computer Mk I"],
      ranges: { optimal: 420, max: 900, idealMin: 540, idealMax: 810 },
      heat: { generation: 2.5, capacity: 40, dissipation: 2.2 },
      dps: { sustained: 12, max: 24 },
    },
    class: "Heavy",
    tech: "Clan",
    tonnage: 75,
    equipment: ["ECM", "Targeting Computer Mk I"],
    primaryRangeBracket: [540, 810] as [number, number],
    optimalRange: 420,
    maxRange: 900,
  };
}

describe("upsertMechHandler", () => {
  it("returns 200 for valid input", async () => {
    upsertMechWithIdMock.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440001" });

    const response = await upsertMechHandler({
      params: { id: "550e8400-e29b-41d4-a716-446655440001" },
      json: async () => validPayload(),
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(200);
  });

  it("returns 400 for missing id", async () => {
    const response = await upsertMechHandler({
      params: {},
      json: async () => validPayload(),
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(400);
  });

  it("returns 400 for non-guid id", async () => {
    const response = await upsertMechHandler({
      params: { id: "BSK-2_alpha" },
      json: async () => validPayload(),
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(400);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("BAD_REQUEST");
  });
});
