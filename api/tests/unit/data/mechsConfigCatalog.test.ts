import { describe, expect, it } from "vitest";
import { resolveConfigMech } from "../../../src/data/mechsConfigCatalog.js";

describe("mechs config hero aliases", () => {
  it.each([
    ["Flea", "FLE-R5K", "ROMEO 5000"],
    ["Flea", "R5K", "ROMEO 5000"],
    ["Longbow", "LGB-OC", "OVERCHARGE"],
    ["Longbow", "OC", "OVERCHARGE"],
    ["Ebon Jaguar", "ESPRIT DE CORPS", "ESPRIT DE CORPS"],
    ["Ebon Jaguar", "EC", "ESPRIT DE CORPS"],
    ["Bushwacker", "HR", "HIGH ROLLER"],
    ["Enforcer", "GH", "GHILLIE"],
    ["Rifleman", "RFL-LK", "LEGEND-KILLER"],
    ["Rifleman", "LK", "LEGEND-KILLER"],
  ])("resolves %s %s to %s", (chassis, submittedVariant, canonicalVariant) => {
    const result = resolveConfigMech(chassis, submittedVariant, "IS");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.value.chassis).toBe(chassis);
      expect(result.value.variant).toBe(canonicalVariant);
    }
  });
});
