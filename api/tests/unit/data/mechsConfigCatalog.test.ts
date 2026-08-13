import { describe, expect, it } from "vitest";
import { resolveConfigMech } from "../../../src/data/mechsConfigCatalog.js";

describe("mechs config hero aliases", () => {
  it.each([
    ["Flea", "FLE-R5K", "ROMEO 5000"],
    ["Flea", "R5K", "ROMEO 5000"],
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
