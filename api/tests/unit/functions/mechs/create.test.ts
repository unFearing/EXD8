import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/db/repositories/mechRepository.js", () => ({
  createMech: vi.fn(async (input: {
    chassis: string;
    variant: string;
    codename: string;
    link: string;
    skillCode: string;
    weaponry: string;
    description: string;
    role: string;
    buildCodes: Record<string, string>;
    metadata: {
      equipment: string[];
      ranges: { optimal: number; max: number; idealMin: number; idealMax: number };
      heat: { generation: number; capacity: number; dissipation: number };
      dps: { sustained: number; max: number };
    };
    class?: "Light" | "Medium" | "Heavy" | "Assault";
    tech?: "IS" | "Clan";
    tonnage?: number;
    buildUrl?: string;
    equipment?: string[];
    primaryRangeBracket?: [number, number];
    optimalRange?: number;
    maxRange?: number;
  }) => ({
    ...input,
    id: "550e8400-e29b-41d4-a716-446655440000",
    schemaVersion: "1.0",
    docType: "mech",
  })),
}));

import { createMechHandler } from "../../../../src/functions/mechs/create.js";

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

describe("createMechHandler", () => {
  it("returns 201 for valid input", async () => {
    const response = await createMechHandler({
      json: async () => validPayload(),
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(201);
  });

  it("returns 400 for invalid schema", async () => {
    const response = await createMechHandler({
      json: async () => ({ class: "Heavy" }),
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(400);
  });

  it("returns 403 for read-only role", async () => {
    const response = await createMechHandler({
      json: async () => validPayload(),
      headers: new Headers({
        "x-user-role": "Pilot",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(403);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("FORBIDDEN");
  });
});
