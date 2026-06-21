import { describe, expect, it, vi } from "vitest";

const { getMechHierarchyMock } = vi.hoisted(() => ({
  getMechHierarchyMock: vi.fn(),
}));

vi.mock("../../db/repositories/mechRepository.js", () => ({
  getMechHierarchy: getMechHierarchyMock,
}));

import { getMechHierarchyHandler } from "./hierarchy.js";

describe("getMechHierarchyHandler", () => {
  it("returns 200 with hierarchy", async () => {
    getMechHierarchyMock.mockResolvedValueOnce([
      {
        class: "Heavy",
        buildCount: 2,
        chassis: [{ chassis: "TBR", buildCount: 2, variants: [{ variant: "TBR-S", buildCount: 2 }] }],
      },
    ]);

    const response = await getMechHierarchyHandler({
      headers: new Headers({
        "x-team-id": "exd8",
        "x-user-id": "user-1",
        "x-user-role": "Pilot",
      }),
    } as never);

    expect(response.status).toBe(200);
  });

  it("returns 403 when auth headers are missing", async () => {
    getMechHierarchyMock.mockResolvedValueOnce([]);

    const response = await getMechHierarchyHandler({
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(403);
  });
});
