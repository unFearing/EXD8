import { describe, expect, it } from "vitest";

// Core sanitization logic tests
// Note: Functions stripCosmosFields and isDeckSlotFilled are tested at the module level

function stripCosmosFields<T extends { _rid?: string; _self?: string; _etag?: string; _attachments?: string; _ts?: number }>(
  value: T,
): Omit<T, "_rid" | "_self" | "_etag" | "_attachments" | "_ts"> {
  const {
    _rid: _,
    _self: __,
    _etag: ___,
    _attachments: ____,
    _ts: _____,
    ...rest
  } = value;
  return rest;
}

function isDeckSlotFilled(slot: { mech?: string; chassis?: string; variant?: string; buildUrl?: string }): boolean {
  return Boolean(slot.mech?.trim() || slot.chassis?.trim() || slot.variant?.trim() || slot.buildUrl?.trim());
}

describe("Backup Sanitization", () => {
  describe("stripCosmosFields", () => {
    it("removes _rid, _self, _etag, _attachments, _ts fields", () => {
      const doc = {
        id: "test-1",
        value: "data",
        _rid: "rid",
        _self: "self",
        _etag: "etag",
        _attachments: "att",
        _ts: 123,
      };

      const result = stripCosmosFields(doc);
      expect(result).toEqual({ id: "test-1", value: "data" });
      expect("_rid" in result).toBe(false);
      expect("_ts" in result).toBe(false);
    });

    it("preserves all non-Cosmos fields", () => {
      const doc = { id: "1", name: "test", data: { nested: true }, _ts: 456 };
      const result = stripCosmosFields(doc);
      expect(result.id).toBe("1");
      expect(result.name).toBe("test");
      expect(result.data).toEqual({ nested: true });
    });
  });

  describe("isDeckSlotFilled", () => {
    it("returns true if any field has non-whitespace content", () => {
      expect(isDeckSlotFilled({ mech: "Jenner" })).toBe(true);
      expect(isDeckSlotFilled({ chassis: "JR7" })).toBe(true);
      expect(isDeckSlotFilled({ variant: "F" })).toBe(true);
      expect(isDeckSlotFilled({ buildUrl: "http://x" })).toBe(true);
    });

    it("returns false for empty or whitespace-only slots", () => {
      expect(isDeckSlotFilled({ mech: "", chassis: "", variant: "", buildUrl: "" })).toBe(false);
      expect(isDeckSlotFilled({ mech: "  ", chassis: "\t", variant: "\n" })).toBe(false);
      expect(isDeckSlotFilled({})).toBe(false);
    });
  });

  describe("Deck filtering rules", () => {
    it("counts filled slots correctly", () => {
      const slots = [
        { mech: "Test" },
        { chassis: "" },
        { variant: "PRM" },
        { mech: "   " },
        { buildUrl: "url" },
      ];
      const filled = slots.filter(isDeckSlotFilled);
      expect(filled).toHaveLength(3);
    });

    it("identifies sparse decks (< 5 slots filled)", () => {
      const slots = Array(10)
        .fill(null)
        .map((_, i) => (i < 2 ? { mech: `M${i}` } : { mech: "" }));
      const filled = slots.filter(isDeckSlotFilled);
      expect(filled.length < 5).toBe(true);
    });

    it("identifies full decks (>= 5 slots filled)", () => {
      const slots = Array(10)
        .fill(null)
        .map((_, i) => (i < 6 ? { mech: `M${i}` } : { mech: "" }));
      const filled = slots.filter(isDeckSlotFilled);
      expect(filled.length >= 5).toBe(true);
    });
  });
});
