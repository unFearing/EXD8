import { describe, expect, it, vi } from "vitest";

const { listMapConfigsMock } = vi.hoisted(() => ({
  listMapConfigsMock: vi.fn(),
}));

vi.mock("../../db/repositories/configRepository.js", () => ({
  listMapConfigs: listMapConfigsMock,
}));

import { listMapConfigsHandler } from "./listMaps.js";

describe("listMapConfigsHandler", () => {
  it("returns 200 with map documents", async () => {
    listMapConfigsMock.mockResolvedValueOnce([
      {
        id: "map-river-city",
        name: "River City",
        imageUrl: "https://example.com/maps/river-city.png",
      },
    ]);

    const response = await listMapConfigsHandler();
    expect(response.status).toBe(200);
  });
});
