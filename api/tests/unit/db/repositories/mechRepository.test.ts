import { describe, expect, it } from "vitest";
import { normalizeMechInputForStorage } from "../../../../src/db/repositories/mechRepository.js";
import type { CreateMechInput } from "../../../../src/types/contracts.js";

function buildInput(overrides: Partial<CreateMechInput> = {}): CreateMechInput {
  return {
    chassis: "TIMB",
    variant: "S",
    name: "  Night Harrier  ",
    link: "https://example.com/builds/timb-s",
    buildUrl: "https://example.com/builds/timb-s",
    skillCode: "abc123",
    weaponry: "2x ERPPC",
    description: "test",
    role: "Sniper",
    buildCodes: {
      default: "A111111111111111111111",
      "asym left": "A222222222222222222222",
    },
    metadata: {
      equipment: [],
      ranges: { optimal: 0, max: 0, idealMin: 0, idealMax: 0 },
      heat: { generation: 0, capacity: 0, dissipation: 0 },
      dps: { sustained: 0, max: 0 },
    },
    class: "Heavy",
    tech: "Clan",
    tonnage: 75,
    equipment: [],
    primaryRangeBracket: [0, 0],
    optimalRange: 0,
    maxRange: 0,
    ...overrides,
  };
}

describe("normalizeMechInputForStorage", () => {
  it("removes export build code keys case-insensitively while preserving custom pairs", () => {
    const normalized = normalizeMechInputForStorage(
      buildInput({
        buildCodes: {
          default: "A111111111111111111111",
          export: "A333333333333333333333",
          Export: "A444444444444444444444",
          " export ": "A555555555555555555555",
          "asym left": " A222222222222222222222 ",
          "": "A666666666666666666666",
          blank: "   ",
        },
      }),
    );

    expect(normalized.buildCodes).toEqual({
      default: "A111111111111111111111",
      "asym left": "A222222222222222222222",
    });
  });

  it("trims short name and omits it when blank", () => {
    const named = normalizeMechInputForStorage(buildInput({ name: "  Fast Poke  " }));
    expect(named.name).toBe("Fast Poke");

    const unnamed = normalizeMechInputForStorage(buildInput({ name: "   " }));
    expect(unnamed.name).toBeUndefined();
  });

  it("derives canonical Kitlaan fields from a valid legacy skill code", () => {
    const code = "aff4f5ef742967c910149cdf5ef6a76a0525a0000604b030a100080000000";
    const normalized = normalizeMechInputForStorage(buildInput({ skillCode: code, tech: "Clan" }));

    expect(normalized.skillTreeCode).toBe(code);
    expect(normalized.skillTreeUrl).toBe(`https://kitlaan.gitlab.io/mwoskill2/#/C/${code}`);
  });

  it("derives the code and canonical URL from a Kitlaan URL", () => {
    const code = "aff4f5ef742967c910149cdf5ef6a76a0525a0000604b030a100080000000";
    const normalized = normalizeMechInputForStorage(buildInput({
      skillTreeUrl: `https://kitlaan.gitlab.io/mwoskill2/#/C/${code.toUpperCase()}`,
    }));

    expect(normalized.skillTreeCode).toBe(code);
    expect(normalized.skillTreeUrl).toBe(`https://kitlaan.gitlab.io/mwoskill2/#/C/${code}`);
  });

  it("canonicalizes a pasted route to the mech tech", () => {
    const code = "aff4f5ef742967c910149cdf5ef6a76a0525a0000604b030a100080000000";
    const normalized = normalizeMechInputForStorage(buildInput({
      tech: "IS",
      skillTreeUrl: `https://kitlaan.gitlab.io/mwoskill2/#/C/${code}`,
    }));

    expect(normalized.skillTreeUrl).toBe(`https://kitlaan.gitlab.io/mwoskill2/#/I/${code}`);
  });
});
