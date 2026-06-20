import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/repositories/mechRepository.js", () => ({
  createMech: vi.fn(async (input: {
    class: "Light" | "Medium" | "Heavy" | "Assault";
    tech: "IS" | "Clan";
    tonnage: number;
    chassis: string;
    variant: string;
    buildUrl: string;
    skillCode: string;
    weaponry: string;
    equipment: string[];
    description: string;
    role: string;
    buildCodes: Record<string, string>;
    primaryRangeBracket: [number, number];
    optimalRange: number;
    maxRange: number;
  }) => ({
    ...input,
    id: "550e8400-e29b-41d4-a716-446655440000",
    schemaVersion: "1.0.0",
    docType: "mech",
  })),
}));

import { createMechHandler } from "./create.js";

function validPayload() {
  return {
    class: "Heavy",
    tech: "Clan",
    tonnage: 75,
    chassis: "TIMB",
    variant: "S",
    buildUrl: "https://example.com/builds/timberwolf-s",
    skillCode: "a1b2c3",
    weaponry: "2x ERPPC, 4x ERML",
    equipment: ["ECM", "Targeting Computer Mk I"],
    description: "Long-range poke with mobile follow-up pressure.",
    role: "Sniper",
    buildCodes: {
      stock: "ABC123",
      premium: "DEF456",
    },
    primaryRangeBracket: [540, 810] as [number, number],
    optimalRange: 420,
    maxRange: 300,
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