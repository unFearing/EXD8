import { describe, expect, it, vi } from "vitest";

const { listMechsMock } = vi.hoisted(() => ({
  listMechsMock: vi.fn(),
}));

vi.mock("../../../../src/db/repositories/mechRepository.js", () => ({
  listMechs: listMechsMock,
}));

import { listMechsHandler } from "../../../../src/functions/mechs/list.js";

describe("listMechsHandler", () => {
  it("returns 200 with mech list", async () => {
    listMechsMock.mockResolvedValueOnce([{ id: "BSK-2_alpha" }]);

    const response = await listMechsHandler({
      headers: new Headers({ "x-team-id": "EXD8", "x-user-id": "pilot-1", "x-user-role": "Pilot" }),
    } as never);

    expect(response.status).toBe(200);
  });

  it("returns 403 when auth context is missing", async () => {
    listMechsMock.mockResolvedValueOnce([]);

    const response = await listMechsHandler({
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(403);
  });
});
