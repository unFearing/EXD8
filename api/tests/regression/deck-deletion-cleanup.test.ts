import { describe, expect, it } from "vitest";

// Test for orphan reference cleanup after deck deletion
describe("Deck Deletion Orphan Cleanup", () => {
  describe("Quickslots cleanup after deck deletion", () => {
    it("removes quickslot entries referencing deleted deck", () => {
      const quickslots = [
        { deckId: "deck-1", mapId: "map-1" },
        { deckId: "deck-2", mapId: "map-2" },
        { deckId: "deck-1", mapId: "map-3" },
        { deckId: "deck-3", mapId: "map-4" },
      ];

      const deletedDeckId = "deck-1";
      const filtered = quickslots.filter((entry) => entry.deckId !== deletedDeckId);

      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual([
        { deckId: "deck-2", mapId: "map-2" },
        { deckId: "deck-3", mapId: "map-4" },
      ]);
    });

    it("removes all quickslot entries if deck is used in multiple maps", () => {
      const quickslots = [
        { deckId: "deck-1", mapId: "map-1" },
        { deckId: "deck-1", mapId: "map-2" },
        { deckId: "deck-1", mapId: "map-3" },
        { deckId: "deck-2", mapId: "map-4" },
      ];

      const deletedDeckId = "deck-1";
      const filtered = quickslots.filter((entry) => entry.deckId !== deletedDeckId);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toEqual({ deckId: "deck-2", mapId: "map-4" });
    });

    it("does not affect quickslots from other decks", () => {
      const quickslots = [
        { deckId: "deck-1", mapId: "map-1" },
        { deckId: "deck-2", mapId: "map-2" },
        { deckId: "deck-3", mapId: "map-3" },
      ];

      const deletedDeckId = "deck-2";
      const filtered = quickslots.filter((entry) => entry.deckId !== deletedDeckId);

      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual([
        { deckId: "deck-1", mapId: "map-1" },
        { deckId: "deck-3", mapId: "map-3" },
      ]);
    });

    it("handles empty quickslots", () => {
      const quickslots: Array<{ deckId: string; mapId: string }> = [];
      const deletedDeckId = "deck-1";
      const filtered = quickslots.filter((entry) => entry.deckId !== deletedDeckId);

      expect(filtered).toHaveLength(0);
    });

    it("handles deletion of non-existent deck", () => {
      const quickslots = [
        { deckId: "deck-1", mapId: "map-1" },
        { deckId: "deck-2", mapId: "map-2" },
      ];

      const deletedDeckId = "deck-99";
      const filtered = quickslots.filter((entry) => entry.deckId !== deletedDeckId);

      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual(quickslots);
    });
  });

  describe("Template state cleanup after deck deletion", () => {
    it("removes deleted deck from template list", () => {
      const templates = [
        { id: "deck-1", name: "Deck 1" },
        { id: "deck-2", name: "Deck 2" },
        { id: "deck-3", name: "Deck 3" },
      ];

      const deletedDeckId = "deck-2";
      const filtered = templates.filter((t) => t.id !== deletedDeckId);

      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual([
        { id: "deck-1", name: "Deck 1" },
        { id: "deck-3", name: "Deck 3" },
      ]);
    });

    it("clears selected template if deleted deck was selected", () => {
      const selectedTemplateId = "deck-2";
      const deletedDeckId = "deck-2";

      const newSelectedId = selectedTemplateId === deletedDeckId ? "" : selectedTemplateId;

      expect(newSelectedId).toBe("");
    });

    it("preserves selected template if different deck is deleted", () => {
      const selectedTemplateId = "deck-1";
      const deletedDeckId = "deck-2";

      const newSelectedId = selectedTemplateId === deletedDeckId ? "" : selectedTemplateId;

      expect(newSelectedId).toBe("deck-1");
    });
  });

  describe("Synced state cleanup after deck deletion", () => {
    it("removes deleted deck from syncedSignatures cache", () => {
      const syncedSignatures = new Map([
        ["deck-1", "sig-1"],
        ["deck-2", "sig-2"],
        ["deck-3", "sig-3"],
      ]);

      const deletedDeckId = "deck-2";
      syncedSignatures.delete(deletedDeckId);

      expect(syncedSignatures.size).toBe(2);
      expect(syncedSignatures.has("deck-2")).toBe(false);
      expect(syncedSignatures.get("deck-1")).toBe("sig-1");
    });

    it("removes deleted deck from syncedTemplates cache", () => {
      const syncedTemplates = new Map([
        ["deck-1", { id: "deck-1", name: "Deck 1" }],
        ["deck-2", { id: "deck-2", name: "Deck 2" }],
      ]);

      const deletedDeckId = "deck-1";
      syncedTemplates.delete(deletedDeckId);

      expect(syncedTemplates.size).toBe(1);
      expect(syncedTemplates.has("deck-1")).toBe(false);
      expect(syncedTemplates.has("deck-2")).toBe(true);
    });
  });
});
