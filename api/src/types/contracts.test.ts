import { describe, expect, it } from "vitest";
import { matchNightCreateInputSchema } from "./contracts.js";

describe("matchNightCreateInputSchema", () => {
  it("accepts a valid payload", () => {
    const result = matchNightCreateInputSchema.safeParse({
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
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid payload", () => {
    const result = matchNightCreateInputSchema.safeParse({
      teamId: "",
      seasonId: "season-2026",
      date: "2026-06-14",
      round: 1,
      opponent: "Opponent",
      drops: [],
    });

    expect(result.success).toBe(false);
  });
});
