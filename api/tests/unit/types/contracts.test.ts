import { describe, expect, it } from "vitest";
import { matchNightCreateInputSchema, mechDocSchema } from "../../../src/types/contracts.js";

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

describe("mechDocSchema", () => {
  it("accepts a valid mech payload", () => {
    const result = mechDocSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      chassis: "TIMB",
      variant: "S",
      codename: "TIMB-S",
      link: "https://example.com/builds/timberwolf-s",
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
      buildUrl: "https://example.com/builds/timberwolf-s",
      equipment: ["ECM", "Targeting Computer Mk I"],
      primaryRangeBracket: [540, 810],
      optimalRange: 420,
      maxRange: 900,
      schemaVersion: "1.0",
      docType: "mech",
    });

    expect(result.success).toBe(true);
  });

  it("rejects mismatched tonnage and class", () => {
    const result = mechDocSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      class: "Light",
      tech: "IS",
      tonnage: 40,
      chassis: "JR7",
      variant: "F",
      codename: "JR7-F",
      link: "https://example.com/builds/jenner-f",
      buildUrl: "https://example.com/builds/jenner-f",
      skillCode: "z9y8x7",
      weaponry: "4x ML, SRM-4",
      metadata: {
        equipment: ["Jump Jets"],
        ranges: { optimal: 180, max: 450, idealMin: 90, idealMax: 270 },
        heat: { generation: 1.6, capacity: 30, dissipation: 1.7 },
        dps: { sustained: 8, max: 15 },
      },
      equipment: ["Jump Jets"],
      description: "Fast skirmisher.",
      role: "Scout",
      buildCodes: {
        default: "XYZ789",
      },
      primaryRangeBracket: [90, 270],
      optimalRange: 180,
      maxRange: 450,
      schemaVersion: "1.0",
      docType: "mech",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an arbitrary mech role string", () => {
    const result = mechDocSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      chassis: "AS7",
      variant: "D",
      codename: "AS7-D",
      link: "https://example.com/builds/atlas-d",
      skillCode: "atlas100",
      weaponry: "AC/20, SRM-6, 2x ML",
      description: "Anchor mech for front-loaded pushes.",
      role: "Anchor",
      buildCodes: {
        standard: "ATLAS-01",
      },
      metadata: {
        equipment: ["AMS"],
        ranges: { optimal: 180, max: 540, idealMin: 0, idealMax: 270 },
        heat: { generation: 2.1, capacity: 38, dissipation: 1.9 },
        dps: { sustained: 9, max: 18 },
      },
      class: "Assault",
      tech: "IS",
      tonnage: 100,
      buildUrl: "https://example.com/builds/atlas-d",
      equipment: ["AMS"],
      primaryRangeBracket: [0, 270],
      optimalRange: 180,
      maxRange: 540,
      schemaVersion: "1.0",
      docType: "mech",
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-guid mech id", () => {
    const result = mechDocSchema.safeParse({
      id: "BSK-2_alpha",
      class: "Heavy",
      tech: "Clan",
      tonnage: 75,
      chassis: "TIMB",
      variant: "S",
      codename: "TIMB-S",
      link: "https://example.com/builds/timberwolf-s",
      buildUrl: "https://example.com/builds/timberwolf-s",
      skillCode: "a1b2c3",
      weaponry: "2x ERPPC, 4x ERML",
      metadata: {
        equipment: ["ECM"],
        ranges: { optimal: 420, max: 900, idealMin: 540, idealMax: 810 },
        heat: { generation: 2.5, capacity: 40, dissipation: 2.2 },
        dps: { sustained: 12, max: 24 },
      },
      equipment: ["ECM"],
      description: "Guid id required",
      role: "Sniper",
      buildCodes: {
        stock: "ABC123",
      },
      primaryRangeBracket: [540, 810],
      optimalRange: 420,
      maxRange: 900,
      schemaVersion: "1.0",
      docType: "mech",
    });

    expect(result.success).toBe(false);
  });
});
