import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/repositories/matchNightRepository.js", () => ({
  createMatchNight: vi.fn(async (input: { teamId: string; seasonId: string; date: string; round: number; opponent: string; drops: unknown[] }, updatedBy: string) => ({
    ...input,
    id: "match-1",
    updatedAt: new Date().toISOString(),
    updatedBy,
    schemaVersion: "1.0.0",
    docType: "matchNight",
  })),
}));

import { createMatchNightHandler } from "./create.js";

function validPayload() {
  return {
    teamId: "exd8",
    seasonId: "season-2026",
    date: "2026-06-14",
    round: 1,
    opponent: "Opponent",
    drops: [
      {
        dropNumber: 1,
        slots: [
          {
            slotId: "d1-s1",
            weightClass: "Light",
            chassis: "Jenner",
            variant: "JR7",
            pilot: "unF",
            candidatePilots: [],
            buildLink: "https://example.com/build",
            skillCode: "AAABBB",
            role: "Scout",
            keyFactors: {
              ecm: false,
              bap: true,
              jumpJets: false,
              speedKph: 150,
            },
            isBackup: false,
            notes: "",
          },
        ],
        mapLink: "https://example.com/map",
        locked: false,
      },
    ],
  };
}

describe("createMatchNightHandler", () => {
  it("returns 201 for valid input", async () => {
    const response = await createMatchNightHandler({
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
    const response = await createMatchNightHandler({
      json: async () => ({ teamId: "exd8" }),
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
      }),
    } as never);

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing nested slot id", async () => {
    const payload = validPayload();
    delete (payload.drops[0].slots[0] as { slotId?: string }).slotId;

    const response = await createMatchNightHandler({
      json: async () => payload,
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(400);
  });

  it("returns 409 for team mismatch", async () => {
    const response = await createMatchNightHandler({
      json: async () => validPayload(),
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "other-team",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(409);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("TEAM_MISMATCH");
  });
});
